const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ============= GAME STATE =============
const ADMIN = { user: 'haodt', pass: '12345' };
const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];
const COLOR_NAMES = ['Đỏ', 'Xanh Dương', 'Xanh Lá', 'Vàng'];
const GRID = 20;
const TOTAL_CELLS = GRID * GRID; // 400

let gameState = null;
let players = {}; // socketId -> { id, name, team, color }
let teams = {};   // teamIndex -> { color, players: [socketIds], matchedPairs: [{num, cells}], score }

function initGame() {
  // Generate board: each team gets 100 cells with 50 pairs
  // Each cell: { team, num, matched: false, revealed: false }
  const cells = new Array(TOTAL_CELLS).fill(null);
  const cellsPerTeam = TOTAL_CELLS / 4; // 100
  
  // Create team cell pools
  const teamPools = [[], [], [], []];
  for (let t = 0; t < 4; t++) {
    // 50 numbers, each appears twice
    let nums = [];
    for (let i = 0; i < 50; i++) {
      const num = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      nums.push(num, num);
    }
    // Shuffle
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    teamPools[t] = nums;
  }
  
  // Assign cells to teams randomly across the grid
  const indices = [...Array(TOTAL_CELLS).keys()];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  
  for (let t = 0; t < 4; t++) {
    for (let c = 0; c < cellsPerTeam; c++) {
      const idx = indices[t * cellsPerTeam + c];
      cells[idx] = {
        team: t,
        num: teamPools[t][c],
        matched: false,
        revealed: false
      };
    }
  }
  
  gameState = { cells, started: false, finished: false, winner: null };
  teams = { 0: { matchedPairs: [], score: 0 }, 1: { matchedPairs: [], score: 0 }, 2: { matchedPairs: [], score: 0 }, 3: { matchedPairs: [], score: 0 } };
  console.log('🎮 Game initialized: 400 cells, 4 teams × 100 cells each');
}

function getPlayerTeam(socketId) {
  const p = players[socketId];
  return p ? p.team : null;
}

// ============= SOCKET.IO =============
io.on('connection', (socket) => {
  const ip = socket.handshake.address;
  const playerId = crypto.createHash('md5').update(ip + Date.now()).digest('hex').slice(0, 8);
  
  console.log(`🔌 Connected: ${playerId}`);
  
  socket.on('login', (data) => {
    const { name } = data;
    
    // Check admin
    if (name === ADMIN.user && data.password === ADMIN.pass) {
      players[socket.id] = { id: playerId, name: 'Quản Trò', team: -1, isAdmin: true };
      socket.emit('login_ok', { id: playerId, isAdmin: true });
      
      // Re-init game if not exists
      if (!gameState) initGame();
      return;
    }
    
    // Regular player
    if (!name || name.trim() === '') {
      socket.emit('login_error', 'Vui lòng nhập tên');
      return;
    }
    
    players[socket.id] = { id: playerId, name: name.trim(), team: -1, isAdmin: false };
    socket.emit('login_ok', { id: playerId, isAdmin: false });
    io.emit('player_list', getPlayerList());
  });
  
  socket.on('join_team', (data) => {
    const team = parseInt(data.team);
    if (team < 0 || team > 3) return;
    
    const p = players[socket.id];
    if (!p) return;
    
    // Leave old team
    if (p.team >= 0 && teams[p.team]) {
      teams[p.team].players = (teams[p.team].players || []).filter(id => id !== socket.id);
    }
    
    p.team = team;
    if (!teams[team].players) teams[team].players = [];
    teams[team].players.push(socket.id);
    
    socket.emit('team_joined', { team, color: COLORS[team], colorName: COLOR_NAMES[team] });
    io.emit('player_list', getPlayerList());
  });
  
  socket.on('admin_start', () => {
    const p = players[socket.id];
    if (!p || !p.isAdmin) return;
    if (!gameState) initGame();
    gameState.started = true;
    io.emit('game_started', {
      size: GRID,
      teams: teams,
      playerList: getPlayerList()
    });
    console.log('🚀 Game started!');
  });
  
  socket.on('admin_reset', () => {
    const p = players[socket.id];
    if (!p || !p.isAdmin) return;
    initGame();
    // Reset player teams
    Object.values(players).forEach(pl => { pl.team = -1; });
    teams = { 0: { matchedPairs: [], score: 0 }, 1: { matchedPairs: [], score: 0 }, 2: { matchedPairs: [], score: 0 }, 3: { matchedPairs: [], score: 0 } };
    io.emit('game_reset');
    io.emit('player_list', getPlayerList());
  });
  
  socket.on('reveal_cell', (data) => {
    if (!gameState || !gameState.started || gameState.finished) return;
    
    const player = players[socket.id];
    if (!player || player.team < 0) return;
    
    const { cellIndex } = data;
    const cell = gameState.cells[cellIndex];
    if (!cell || cell.matched || cell.revealed) return;
    
    // Only reveal cells of player's own team
    if (cell.team !== player.team) {
      socket.emit('wrong_team', { cellIndex, msg: 'Ô này thuộc đội khác!' });
      return;
    }
    
    cell.revealed = true;
    io.emit('cell_revealed', {
      cellIndex,
      num: cell.num,
      team: cell.team,
      color: COLORS[cell.team]
    });
    
    // Check for pair match: find another revealed cell of same team with same num, not yet matched
    const teamCells = gameState.cells
      .map((c, i) => ({ ...c, index: i }))
      .filter(c => c.team === player.team && c.revealed && !c.matched && c.num === cell.num)
      .filter(c => c.index !== cellIndex);
    
    if (teamCells.length > 0) {
      // Found a pair!
      const matchIdx = teamCells[0].index;
      gameState.cells[cellIndex].matched = true;
      gameState.cells[matchIdx].matched = true;
      
      teams[player.team].matchedPairs.push({
        num: cell.num,
        cells: [cellIndex, matchIdx]
      });
      teams[player.team].score++;
      
      io.emit('pair_matched', {
        cells: [cellIndex, matchIdx],
        num: cell.num,
        team: player.team,
        color: COLORS[player.team],
        score: teams[player.team].score
      });
      
      // Check win: 2 pairs = 4 cells matched, score >= 2
      if (teams[player.team].score >= 2 && !gameState.finished) {
        gameState.finished = true;
        gameState.winner = player.team;
        io.emit('game_won', {
          team: player.team,
          color: COLORS[player.team],
          colorName: COLOR_NAMES[player.team],
          score: teams[player.team].score
        });
        console.log(`🏆 Đội ${COLOR_NAMES[player.team]} thắng!`);
      }
    }
  });
  
  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (p && p.team >= 0 && teams[p.team]) {
      teams[p.team].players = (teams[p.team].players || []).filter(id => id !== socket.id);
    }
    delete players[socket.id];
    io.emit('player_list', getPlayerList());
    console.log(`🔌 Disconnected: ${p ? p.name : socket.id}`);
  });
});

function getPlayerList() {
  const list = [];
  for (const [sid, p] of Object.entries(players)) {
    list.push({ id: p.id, name: p.name, team: p.team, isAdmin: p.isAdmin, socketId: sid });
  }
  return list;
}

function getTeamStats() {
  const stats = {};
  for (let t = 0; t < 4; t++) {
    stats[t] = {
      color: COLORS[t],
      colorName: COLOR_NAMES[t],
      players: (teams[t].players || []).map(sid => {
        const p = players[sid];
        return p ? p.name : '?';
      }),
      score: teams[t].score || 0,
      matchedPairs: teams[t].matchedPairs || []
    };
  }
  return stats;
}

const PORT = process.env.PORT || 3456;
server.listen(PORT, () => {
  console.log(`🎮 Game server running on http://localhost:${PORT}`);
  initGame();
});