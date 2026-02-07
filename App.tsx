
import React, { useState } from 'react';
import { GameState, Phase, Role, Player, GameMode } from './types';
import { getGameNarrative } from './services/geminiService';
import PlayerCard from './components/PlayerCard';
import NarratorBox from './components/NarratorBox';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    currentPhase: Phase.LOBBY,
    dayCount: 1,
    history: [],
    lastDoctorTargetId: null,
    avengerMark: null,
    nightActions: { werewolfVotes: {}, doctorProtect: null, seerCheck: null, witchKill: null, avengerMark: null }
  });
  
  // Inizializzato con 3 slot vuoti come richiesto
  const [setupNames, setSetupNames] = useState<string[]>(['', '', '']);
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({
    [Role.WEREWOLF]: 1,
    [Role.SEER]: 1,
    [Role.DOCTOR]: 0,
    [Role.AVENGER]: 0,
    [Role.WITCH]: 0,
  });

  const [narratorMsg, setNarratorMsg] = useState('Le ombre si allungano sul borgo.');
  const [isLoading, setIsLoading] = useState(false);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [revealVisible, setRevealVisible] = useState(false);
  const [nightActionDone, setNightActionDone] = useState(false);

  const isNight = [Phase.NIGHT_START, Phase.NIGHT_TURN].includes(gameState.currentPhase);

  const checkWinConditions = (players: Player[]) => {
    const aliveLupi = players.filter(p => p.isAlive && p.role === Role.WEREWOLF);
    const aliveUmani = players.filter(p => p.isAlive && p.role !== Role.WEREWOLF);

    if (aliveLupi.length === 0) return 'VILLAGERS';
    if (aliveLupi.length >= aliveUmani.length) return 'WEREWOLVES';
    return null;
  };

  const updateRoleCount = (role: string, delta: number) => {
    const validNames = setupNames.filter(n => n.trim() !== "");
    const currentTotalSpecial = Object.values(roleCounts).reduce((a, b) => a + b, 0);
    if (delta > 0 && currentTotalSpecial >= validNames.length) return; 
    setRoleCounts(prev => ({
      ...prev,
      [role]: Math.max(role === Role.WEREWOLF ? 1 : 0, prev[role] + delta)
    }));
  };

  const initializeLocalGame = () => {
    const validNames = setupNames.filter(n => n.trim() !== "");
    if (validNames.length < 3) {
      alert("Servono almeno 3 anime per iniziare il rito.");
      return;
    }
    const rolesPool: Role[] = [];
    Object.entries(roleCounts).forEach(([role, count]) => {
      for (let i = 0; i < count; i++) rolesPool.push(role as Role);
    });
    while (rolesPool.length < validNames.length) rolesPool.push(Role.VILLAGER);

    const shuffledRoles = rolesPool.sort(() => Math.random() - 0.5);
    const players: Player[] = validNames.map((name, i) => ({
      id: `p-${i}`,
      name,
      role: shuffledRoles[i],
      isAlive: true,
      isAI: false,
      hasPoison: shuffledRoles[i] === Role.WITCH
    }));

    setGameState({
      ...gameState,
      players,
      currentPhase: Phase.ROLE_REVEAL,
      revealIndex: 0,
      history: ["Inizio partita locale."]
    });
  };

  const processNightResults = () => {
    const { werewolfVotes, doctorProtect, witchKill, avengerMark } = gameState.nightActions;
    
    const wolfTargetIds = Object.values(werewolfVotes);
    const uniqueTargets = [...new Set(wolfTargetIds)];
    let wolfTarget = null;
    
    if (uniqueTargets.length === 1) {
      wolfTarget = uniqueTargets[0];
    } else if (uniqueTargets.length > 1) {
      wolfTarget = uniqueTargets[Math.floor(Math.random() * uniqueTargets.length)];
    }

    const deaths: string[] = [];
    if (wolfTarget && wolfTarget !== doctorProtect) deaths.push(wolfTarget);
    if (witchKill) deaths.push(witchKill);

    const avenger = gameState.players.find(p => p.role === Role.AVENGER);
    if (avenger && deaths.includes(avenger.id) && avengerMark) {
      deaths.push(avengerMark);
    }

    const updatedPlayers = gameState.players.map(p => 
      deaths.includes(p.id) ? { ...p, isAlive: false } : p
    );

    const win = checkWinConditions(updatedPlayers);
    if (win) {
      setGameState(prev => ({ ...prev, players: updatedPlayers, currentPhase: Phase.GAME_OVER, winner: win }));
      return `L'ultima candela si è spenta. ${win === 'VILLAGERS' ? 'Il villaggio respira' : 'I lupi hanno vinto'}.`;
    }

    setGameState(prev => ({
      ...prev,
      players: updatedPlayers,
      currentPhase: Phase.DAY_NARRATION,
      lastDoctorTargetId: doctorProtect,
      avengerMark: avengerMark,
      nightActions: { werewolfVotes: {}, doctorProtect: null, seerCheck: null, witchKill: null, avengerMark: null }
    }));

    const deathNames = deaths.map(id => gameState.players.find(p => p.id === id)?.name).join(", ");
    let msg = deaths.length > 0 ? `Il mattino è rosso: ${deathNames} non hanno superato l'oscurità.` : "Il sole sorge su un villaggio intatto. Per ora.";
    
    if (avenger && deaths.includes(avenger.id) && avengerMark) {
      const markName = gameState.players.find(p => p.id === avengerMark)?.name;
      msg += ` Il Vendicatore morente ha trascinato ${markName} nell'abisso.`;
    }
    
    return msg;
  };

  const nextPhase = async () => {
    setIsLoading(true);
    let actionDesc = "";

    if (gameState.currentPhase === Phase.ROLE_REVEAL) {
      const nextIdx = (gameState.revealIndex || 0) + 1;
      if (nextIdx < gameState.players.length) {
        setGameState(prev => ({ ...prev, revealIndex: nextIdx }));
        setRevealVisible(false);
      } else {
        setGameState(prev => ({ ...prev, currentPhase: Phase.NIGHT_START }));
        setNarratorMsg("Tutti hanno visto il proprio volto. Ora, dimenticatelo e chiudete gli occhi.");
      }
    } else if (gameState.currentPhase === Phase.NIGHT_START) {
      setGameState(prev => ({ ...prev, currentPhase: Phase.NIGHT_TURN, nightTurnIndex: 0 }));
      setNightActionDone(false);
      setRevealVisible(false);
    } else if (gameState.currentPhase === Phase.NIGHT_TURN) {
      const alivePlayers = gameState.players.filter(p => p.isAlive);
      const nextIdx = (gameState.nightTurnIndex || 0) + 1;
      
      if (nextIdx < alivePlayers.length) {
        setGameState(prev => ({ ...prev, nightTurnIndex: nextIdx }));
        setNightActionDone(false);
        setRevealVisible(false);
      } else {
        actionDesc = processNightResults();
      }
    } else if (gameState.currentPhase === Phase.DAY_VOTING) {
      const voteCounts: Record<string, number> = {};
      Object.values(votes).forEach(v => voteCounts[v] = (voteCounts[v] || 0) + 1);
      const sorted = Object.entries(voteCounts).sort((a,b) => b[1]-a[1]);
      const targetId = sorted[0]?.[0];
      
      if (targetId) {
        const deadPlayer = gameState.players.find(p => p.id === targetId);
        const deaths = [targetId];
        
        if (deadPlayer?.role === Role.AVENGER && gameState.avengerMark) {
          deaths.push(gameState.avengerMark);
        }

        const updated = gameState.players.map(p => deaths.includes(p.id) ? {...p, isAlive: false} : p);
        const win = checkWinConditions(updated);
        
        const markName = gameState.players.find(p => p.id === gameState.avengerMark)?.name;
        actionDesc = `Il veggente ha ucciso ${deadPlayer?.name}.`;
        if (deadPlayer?.role === Role.AVENGER && gameState.avengerMark) {
          actionDesc += ` Il Vendicatore si è portato nella tomba ${markName}.`;
        }
        
        if (win) {
          setGameState(prev => ({ ...prev, players: updated, currentPhase: Phase.GAME_OVER, winner: win }));
        } else {
           setGameState(prev => ({ ...prev, players: updated, currentPhase: Phase.NIGHT_START, dayCount: prev.dayCount + 1 }));
        }
      } else {
        setGameState(prev => ({ ...prev, currentPhase: Phase.NIGHT_START, dayCount: prev.dayCount + 1 }));
        actionDesc = "Nessun verdetto. La folla è indecisa, ma il tempo scorre.";
      }
      setVotes({});
    } else if (gameState.currentPhase === Phase.DAY_NARRATION) {
      setGameState(prev => ({ ...prev, currentPhase: Phase.DAY_DISCUSSION }));
      actionDesc = "Parlate. Scavate nelle parole dei vostri vicini.";
    } else if (gameState.currentPhase === Phase.DAY_DISCUSSION) {
      setGameState(prev => ({ ...prev, currentPhase: Phase.DAY_VOTING }));
      actionDesc = "Il borgo esige una vittima. Scegliete con cura.";
    }

    if (actionDesc) {
      const narrative = await getGameNarrative(gameState, actionDesc);
      setNarratorMsg(narrative || actionDesc);
    }
    setIsLoading(false);
  };

  const handleNightTurnAction = (targetId: string) => {
    const alivePlayers = gameState.players.filter(p => p.isAlive);
    const active = alivePlayers[gameState.nightTurnIndex || 0];
    
    setGameState(prev => {
      const na = { ...prev.nightActions };
      if (active.role === Role.WEREWOLF) na.werewolfVotes[active.id] = targetId;
      if (active.role === Role.DOCTOR) na.doctorProtect = targetId;
      if (active.role === Role.SEER) na.seerCheck = targetId;
      if (active.role === Role.WITCH) na.witchKill = targetId;
      if (active.role === Role.AVENGER) na.avengerMark = targetId;
      return { ...prev, nightActions: na };
    });
    setNightActionDone(true);
  };

  const currentPlayerNight = gameState.players.filter(p => p.isAlive)[gameState.nightTurnIndex || 0];
  const currentPlayerToReveal = gameState.players[gameState.revealIndex ?? 0];

  const previousWerewolfVotes = Object.entries(gameState.nightActions.werewolfVotes)
    .map(([voterId, targetId]) => {
      const voter = gameState.players.find(p => p.id === voterId);
      const target = gameState.players.find(p => p.id === targetId);
      return `${voter?.name} -> ${target?.name}`;
    });

  return (
    <div className={`transition-all duration-1000 ${isNight ? 'night-gradient' : 'blood-gradient'} flex flex-col items-center relative h-screen w-full overflow-hidden`}>
      {isNight && <div className="night-overlay" />}
      {isNight && <div className="moon-icon">🌙</div>}

      <header className="py-4 sm:py-6 text-center z-20 shrink-0">
        <h1 className="text-4xl sm:text-6xl heading-font text-white drop-shadow-2xl shimmer tracking-tighter">Lupus in Fabula</h1>
        <p className="text-zinc-500 uppercase tracking-[0.5em] text-[10px] mt-1 italic font-bold">Inizia la Caccia</p>
      </header>

      <main className="w-full max-w-4xl z-20 flex-1 overflow-y-auto custom-scrollbar px-4 pb-28">
        {gameState.currentPhase === Phase.LOBBY && (
          <div className="flex flex-col gap-6 items-center h-full justify-center reveal-node">
            <button onClick={() => setGameState(p => ({...p, currentPhase: Phase.SETUP_NAMES}))} className="glass-panel w-full max-w-sm p-14 rounded-[4rem] text-center group hover:border-red-600 transition-all border-red-900/20 shadow-[0_0_80px_rgba(153,27,27,0.2)]">
              <span className="text-7xl mb-6 block animate-bounce">🕯️</span>
              <h2 className="text-3xl font-bold heading-font text-white group-hover:text-red-500 transition-colors">Varcate la Soglia</h2>
              <p className="text-zinc-500 text-[10px] mt-4 uppercase tracking-[0.3em] font-black">Minimo 3 Anime</p>
            </button>
          </div>
        )}

        {gameState.currentPhase === Phase.SETUP_NAMES && (
          <div className="glass-panel p-6 sm:p-10 rounded-[3rem] reveal-node max-w-3xl mx-auto shadow-2xl border-white/5 relative">
            <button onClick={() => setGameState(p => ({...p, currentPhase: Phase.LOBBY}))} className="absolute top-6 left-6 text-zinc-600 hover:text-white transition-colors flex items-center gap-1 text-xs uppercase font-black tracking-widest">
              <span>←</span> Indietro
            </button>
            <h2 className="text-3xl heading-font text-center mb-8 mt-4 text-zinc-100">Chi abiterà il borgo?</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto p-2 custom-scrollbar">
              {setupNames.map((name, i) => (
                <div key={i} className="flex gap-1 animate-in slide-in-from-bottom duration-500" style={{ animationDelay: `${i * 30}ms` }}>
                  <input value={name} onChange={(e) => { const n = [...setupNames]; n[i] = e.target.value; setSetupNames(n); }} placeholder={`Anima ${i+1}`} className="flex-1 bg-black/50 border border-zinc-800 p-3 rounded-2xl text-white outline-none focus:border-red-800 transition-all text-xs sm:text-sm font-bold" />
                  <button onClick={() => setSetupNames(setupNames.filter((_, idx) => idx !== i))} className="text-zinc-700 hover:text-red-600 px-2 text-lg">✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-8">
               <button onClick={() => setSetupNames([...setupNames, ''])} disabled={setupNames.length >= 12} className="flex-1 py-4 border border-dashed border-zinc-700 text-zinc-500 rounded-2xl hover:text-white hover:border-white transition-all text-[10px] uppercase font-black tracking-widest">+ Nuova Anima</button>
               <button onClick={() => setGameState(p => ({...p, currentPhase: Phase.SETUP_ROLES}))} className="flex-[2] bg-red-900 p-4 rounded-2xl font-black heading-font uppercase text-white shadow-2xl hover:bg-red-800 transition-all text-sm tracking-widest">Configura i Ruoli</button>
            </div>
          </div>
        )}

        {gameState.currentPhase === Phase.SETUP_ROLES && (
          <div className="glass-panel p-8 sm:p-12 rounded-[4rem] reveal-node max-w-md mx-auto relative">
            <button onClick={() => setGameState(p => ({...p, currentPhase: Phase.SETUP_NAMES}))} className="absolute top-6 left-8 text-zinc-600 hover:text-white transition-colors flex items-center gap-1 text-xs uppercase font-black tracking-widest">
              <span>←</span> Indietro
            </button>
            <h2 className="text-3xl heading-font text-center mb-10 mt-4 text-zinc-100">Distribuite i Ruoli</h2>
            <div className="space-y-4">
              {Object.keys(roleCounts).map(role => (
                <div key={role} className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5 hover:border-red-900/50 transition-colors">
                  <span className="heading-font text-base text-zinc-200">{role}</span>
                  <div className="flex items-center gap-5">
                    <button onClick={() => updateRoleCount(role, -1)} className="w-10 h-10 rounded-full bg-zinc-900 text-white flex items-center justify-center hover:bg-zinc-800 shadow-lg border border-white/5">-</button>
                    <span className="font-bold text-2xl w-6 text-center text-red-600">{roleCounts[role]}</span>
                    <button onClick={() => updateRoleCount(role, 1)} className="w-10 h-10 rounded-full bg-red-950 text-white flex items-center justify-center hover:bg-red-900 shadow-xl border border-red-800">+</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={initializeLocalGame} className="w-full mt-10 bg-gradient-to-r from-red-950 via-red-900 to-red-950 p-5 rounded-3xl font-black heading-font uppercase shadow-[0_0_50px_rgba(153,27,27,0.4)] tracking-[0.4em] hover:scale-105 transition-all text-xs">Sancisci l'Inizio</button>
          </div>
        )}

        {gameState.currentPhase === Phase.ROLE_REVEAL && (
          <div className="flex flex-col items-center justify-center h-full reveal-node">
             {!revealVisible ? (
               <div className="text-center space-y-12 glass-panel p-16 sm:p-24 rounded-[5rem] shadow-[0_0_100px_rgba(0,0,0,1)] w-full max-w-md border-white/5">
                 <h2 className="text-2xl heading-font text-zinc-500 tracking-[0.3em] uppercase">Passa a</h2>
                 <p className="text-6xl sm:text-7xl font-bold text-white heading-font shimmer tracking-tighter">{currentPlayerToReveal?.name || "Abitante"}</p>
                 <button onClick={() => setRevealVisible(true)} className="bg-red-900/30 border border-red-800/50 px-16 py-6 rounded-3xl text-white font-black tracking-[0.2em] transition-all shadow-2xl active:scale-95 text-xl heading-font hover:bg-red-900">SCOPRI</button>
               </div>
             ) : (
               <div className="text-center space-y-10 glass-panel p-16 sm:p-24 rounded-[6rem] border-4 border-red-900/50 shadow-[0_0_150px_rgba(153,27,27,0.4)] animate-in zoom-in-50 duration-700 w-full max-w-md">
                 <p className="text-zinc-600 text-[10px] uppercase tracking-[0.6em] font-black">Sei un</p>
                 <h2 className="text-6xl sm:text-7xl heading-font text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]">{currentPlayerToReveal?.role}</h2>
                 <button onClick={nextPhase} className="text-zinc-700 text-[10px] font-black uppercase tracking-[0.5em] mt-12 hover:text-white transition-all">Nascondi e Passa</button>
               </div>
             )}
          </div>
        )}

        {gameState.currentPhase === Phase.NIGHT_TURN && (
          <div className="flex flex-col items-center justify-center h-full reveal-node">
             {!revealVisible ? (
               <div className="text-center space-y-10 glass-panel p-16 rounded-[4rem] w-full max-w-md border-blue-900/20 shadow-[0_0_80px_rgba(30,58,138,0.2)]">
                 <h2 className="text-2xl heading-font text-blue-500 uppercase tracking-[0.4em] font-black">Notte</h2>
                 <p className="text-5xl font-bold text-white heading-font">{currentPlayerNight?.name}</p>
                 <button onClick={() => setRevealVisible(true)} className="bg-white/5 hover:bg-white/10 px-16 py-6 rounded-3xl border border-white/10 font-black tracking-[0.3em] transition-all text-lg shadow-xl">SVEGLIATI</button>
               </div>
             ) : (
               <div className="w-full text-center">
                 <div className="mb-8 animate-in slide-in-from-top-10 duration-1000">
                   <h2 className="text-5xl heading-font text-red-700 shimmer mb-2">{currentPlayerNight?.role}</h2>
                   <p className="text-zinc-600 text-[10px] italic uppercase tracking-[0.4em] font-bold">
                     {currentPlayerNight.role === Role.WEREWOLF && "Designa l'agnello sacrificale."}
                     {currentPlayerNight.role === Role.DOCTOR && "Proteggi un'anima dai morsi."}
                     {currentPlayerNight.role === Role.SEER && "Interroga le tenebre."}
                     {currentPlayerNight.role === Role.WITCH && "La pozione è nelle tue mani."}
                     {currentPlayerNight.role === Role.AVENGER && "Segna chi porterai con te se dovessi morire."}
                     {(currentPlayerNight.role === Role.VILLAGER) && "Chiudi gli occhi e attendi l'alba."}
                   </p>
                 </div>
                 
                 {currentPlayerNight.role === Role.WEREWOLF && previousWerewolfVotes.length > 0 && (
                   <div className="mb-8 p-5 bg-red-950/20 border border-red-900/20 rounded-[2.5rem] shadow-inner">
                     <p className="text-red-800 text-[9px] font-black uppercase mb-3 tracking-[0.3em]">Scelte del Branco:</p>
                     <div className="flex flex-wrap justify-center gap-3">
                       {previousWerewolfVotes.map((v, i) => <span key={i} className="bg-red-900/40 text-white text-[9px] px-4 py-1.5 rounded-full border border-red-800/30 font-bold tracking-widest">{v}</span>)}
                     </div>
                   </div>
                 )}

                 {!nightActionDone && [Role.WEREWOLF, Role.SEER, Role.DOCTOR, Role.WITCH, Role.AVENGER].includes(currentPlayerNight.role) ? (
                   <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 px-2">
                     {gameState.players
                       .filter(p => p.isAlive)
                       .filter(p => {
                          if (currentPlayerNight.role === Role.WEREWOLF) return p.id !== currentPlayerNight.id;
                          if (currentPlayerNight.role === Role.DOCTOR) return p.id !== gameState.lastDoctorTargetId;
                          if (currentPlayerNight.role === Role.SEER) return p.id !== currentPlayerNight.id;
                          if (currentPlayerNight.role === Role.AVENGER) return p.id !== currentPlayerNight.id;
                          return true;
                       })
                       .map((p, idx) => (
                        <div key={p.id} onClick={() => handleNightTurnAction(p.id)} className="glass-panel p-3 rounded-3xl border border-white/5 hover:border-red-800 cursor-pointer transition-all hover:scale-115 hover:-translate-y-2 shadow-2xl flex flex-col items-center animate-in zoom-in" style={{ animationDelay: `${idx * 40}ms` }}>
                           <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full overflow-hidden mb-2 border-2 border-zinc-800 transition-transform group-hover:scale-110">
                              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}`} className="w-full h-full object-cover" />
                           </div>
                           <p className="font-black heading-font text-[10px] sm:text-xs truncate w-full text-center text-zinc-300">{p.name}</p>
                        </div>
                     ))}
                   </div>
                 ) : (
                   <div className="glass-panel p-12 rounded-[5rem] reveal-node max-w-xs mx-auto border-green-900/20 shadow-[0_0_100px_rgba(34,197,94,0.1)]">
                     <p className="text-3xl heading-font text-green-600 mb-10 uppercase tracking-[0.5em] font-black">FATTO</p>
                     
                     {currentPlayerNight.role === Role.SEER && gameState.nightActions.seerCheck && (
                        <div className="mb-10 p-6 bg-blue-900/10 rounded-3xl border border-blue-600/20 shadow-2xl scale-125">
                          <p className="text-[9px] text-zinc-600 uppercase mb-2 tracking-[0.4em] font-black">La Verità:</p>
                          <p className="text-3xl font-black text-blue-500 heading-font shimmer">{gameState.players.find(p => p.id === gameState.nightActions.seerCheck)?.role}</p>
                        </div>
                     )}

                     {currentPlayerNight.role === Role.AVENGER && gameState.nightActions.avengerMark && (
                        <div className="mb-10 p-4 bg-red-900/10 rounded-2xl border border-red-600/20 shadow-xl">
                          <p className="text-[8px] text-zinc-600 uppercase mb-1 tracking-[0.2em] font-black">Bersaglio Segnato:</p>
                          <p className="text-xl font-bold text-red-500 heading-font">{gameState.players.find(p => p.id === gameState.nightActions.avengerMark)?.name}</p>
                        </div>
                     )}

                     <button onClick={nextPhase} className="bg-zinc-950 hover:bg-black px-14 py-4 rounded-2xl border border-zinc-800 font-black heading-font tracking-[0.4em] text-xs transition-all active:scale-95 shadow-2xl">CHIUDI OCCHI</button>
                   </div>
                 )}
               </div>
             )}
          </div>
        )}

        {gameState.currentPhase === Phase.GAME_OVER && (
          <div className="flex flex-col items-center justify-center h-full reveal-node">
            <div className={`glass-panel p-20 sm:p-28 rounded-[7rem] text-center border-4 shadow-[0_0_200px_rgba(0,0,0,1)] animate-pulse ${gameState.winner === 'VILLAGERS' ? 'border-blue-900/50 shadow-blue-900/30' : 'border-red-900/50 shadow-red-900/30'}`}>
              <h2 className="text-8xl sm:text-10xl font-black heading-font mb-6 text-white tracking-tighter shimmer">FINIS</h2>
              <p className={`text-4xl sm:text-6xl heading-font mb-16 uppercase tracking-widest ${gameState.winner === 'VILLAGERS' ? 'text-blue-500' : 'text-red-700'}`}>
                {gameState.winner === 'VILLAGERS' ? 'VILLAGGIO SALVO' : 'I LUPI DOMINANO'}
              </p>
              <button onClick={() => window.location.reload()} className="bg-white text-black px-20 py-6 rounded-3xl font-black uppercase tracking-[0.5em] transition-all hover:scale-110 active:scale-95 heading-font text-xl shadow-[0_0_50px_rgba(255,255,255,0.2)]">Nuova Storia</button>
            </div>
          </div>
        )}

        {(gameState.currentPhase === Phase.NIGHT_START || gameState.currentPhase === Phase.DAY_NARRATION || gameState.currentPhase === Phase.DAY_DISCUSSION || gameState.currentPhase === Phase.DAY_VOTING || gameState.currentPhase === Phase.AVENGER_REVENGE) && (
          <div className="flex flex-col h-full reveal-node">
            <NarratorBox message={narratorMsg} title={isNight ? "Eclissi Totale" : `Luce Mortale - Giorno ${gameState.dayCount}`} />
            
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 sm:gap-5 px-1 py-6 flex-1 content-start overflow-y-auto custom-scrollbar">
              {gameState.players.map((p, i) => (
                <PlayerCard 
                  key={p.id} player={p} isUser={false} 
                  canVote={gameState.currentPhase === Phase.DAY_VOTING || gameState.currentPhase === Phase.AVENGER_REVENGE}
                  onVote={(id) => setVotes({ 'user': id })}
                  isVotedByUser={votes['user'] === p.id}
                />
              ))}
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black via-black/95 to-transparent flex justify-center z-50">
                <button 
                  onClick={nextPhase} 
                  disabled={isLoading || (gameState.currentPhase === Phase.DAY_VOTING && !votes['user'])} 
                  className={`px-24 py-5 rounded-3xl font-black heading-font border shadow-[0_0_40px_rgba(0,0,0,0.5)] disabled:opacity-20 uppercase tracking-[0.4em] transition-all text-sm sm:text-lg active:scale-95 ${isNight ? 'bg-zinc-950 border-blue-950 text-blue-600' : 'bg-red-950 border-red-900 text-white shadow-red-950/40'}`}
                >
                  {isLoading ? '...' : (gameState.currentPhase === Phase.DAY_VOTING ? 'Dichiara Verdetto' : 'Avanti')}
                </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
