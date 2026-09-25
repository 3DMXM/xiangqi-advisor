(() => {
  'use strict';

  if (document.getElementById('xqa-panel')) return;

  const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';
  const PIECES = [
    ['K', '帅'], ['A', '仕'], ['B', '相'], ['N', '马'], ['R', '车'], ['C', '炮'], ['P', '兵'],
    ['k', '将'], ['a', '士'], ['b', '象'], ['n', '马'], ['r', '车'], ['c', '炮'], ['p', '卒']
  ];
  const glyph = Object.fromEntries(PIECES);
  const SKIN_TYPES = { Shuai: 'K', Shi: 'A', Xiang: 'B', Ma: 'N', Ju: 'R', Pao: 'C', Bing: 'P' };
  const MATE = 1000000;
  const gameWindow = window;
  const pendingAnalyses = new Map();
  let nextAnalysisId = 0;
  window.addEventListener('message', event => {
    const message = event.data;
    if (event.source !== window || message?.source !== 'xqa-extension-bridge' || message.kind !== 'analysis-result') return;
    const pending = pendingAnalyses.get(message.id);
    if (!pending) return;
    pendingAnalyses.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error === 'timeout') pending.ontimeout();
    else if (message.error) pending.onerror();
    else pending.onload({ status: message.status, responseText: JSON.stringify(message.body) });
  });

  function requestAnalysis({ fen, timeMs, onload, onerror, ontimeout }) {
    const id = String(++nextAnalysisId);
    const cancel = () => window.postMessage({ source: 'xqa-extension-page', kind: 'cancel', id }, location.origin);
    const timer = setTimeout(() => {
      if (!pendingAnalyses.delete(id)) return;
      cancel();
      ontimeout();
    }, timeMs + 5000);
    pendingAnalyses.set(id, { timer, onload, onerror, ontimeout });
    window.postMessage({ source: 'xqa-extension-page', kind: 'analyze', id, fen, timeMs }, location.origin);
    return {
      abort() {
        if (!pendingAnalyses.delete(id)) return;
        clearTimeout(timer);
        cancel();
      }
    };
  }
  const panel = document.createElement('section');
  panel.id = 'xqa-panel';
  panel.innerHTML = `
    <header><b>Pikafish 象棋分析</b><button type="button" data-action="fold" title="收起">−</button></header>
    <div class="xqa-body">
      <label class="xqa-row">局面 FEN<input data-fen spellcheck="false" value="${START_FEN}"></label>
      <div class="xqa-row xqa-controls">
        <label>轮到<select data-turn><option value="r">红方</option><option value="b">黑方</option></select></label>
        <label>思考时间<select data-time-ms><option value="2000">2 秒</option><option value="5000" selected>5 秒</option><option value="10000">10 秒</option></select></label>
        <button type="button" data-action="load">载入</button>
        <button type="button" data-action="analyze">分析</button>
      </div>
      <div class="xqa-row xqa-controls">
        <button type="button" data-action="recognize">识别当前棋盘</button>
        <label>我执<select data-player><option value="r">红方</option><option value="b">黑方</option></select></label>
        <label><input type="checkbox" data-auto checked>自动跟踪</label>
      </div>
      <div class="xqa-row xqa-controls">
        <label>对局模式<select data-battle-mode><option value="auto">自动识别</option><option value="pve">人机对局</option><option value="pvp">真人对局</option></select></label>
      </div>
      <div class="xqa-row xqa-controls">
        <label><input type="checkbox" data-auto-move>自动落子</label>
        <span class="xqa-auto-note">仅在识别到我方回合时执行最佳走法</span>
      </div>
      <div class="xqa-note">先启动本机 Pikafish 服务；进入人机或真人对战后自动跟踪，并在轮到我方时推荐。自动落子默认关闭。</div>
      <div class="xqa-board-frame">
        <div class="xqa-board-heading"><span>棋盘 · 点击交点可编辑</span><strong data-board-advice aria-live="polite">等待分析</strong></div>
        <div class="xqa-position"></div>
      </div>
      <div class="xqa-palette"></div>
      <div data-results aria-live="polite"></div>
    </div>`;
  const style = document.createElement('style');
  style.textContent = `
    #xqa-panel{position:fixed;z-index:2147483000;right:16px;top:16px;width:min(380px,calc(100vw - 24px));max-height:calc(100vh - 32px);overflow:auto;background:#1d1a17;color:#f4ead8;border:1px solid #aa7c48;border-radius:14px;box-shadow:0 14px 42px #000a,0 0 0 1px #fff1 inset;font:13px/1.45 system-ui,sans-serif}
    #xqa-panel *{box-sizing:border-box} #xqa-panel header{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:linear-gradient(135deg,#42301f,#28211b);border-bottom:1px solid #70543a}
    #xqa-panel header b{font-size:15px;letter-spacing:.04em} #xqa-panel button,#xqa-panel select,#xqa-panel input{font:inherit;color:inherit;background:#3b3229;border:1px solid #786147;border-radius:8px;padding:6px 9px}
    #xqa-panel button{cursor:pointer;transition:background .15s,border-color .15s,transform .15s} #xqa-panel button:hover{background:#584533;border-color:#c3965d} #xqa-panel button:active{transform:scale(.97)} #xqa-panel button:focus-visible,#xqa-panel input:focus-visible,#xqa-panel select:focus-visible{outline:2px solid #efc47a;outline-offset:2px}
    #xqa-panel .xqa-body{padding:12px} #xqa-panel .xqa-row{display:flex;gap:7px;align-items:center;margin-bottom:9px} #xqa-panel [data-fen]{flex:1;min-width:0;font:11px ui-monospace,monospace}
    #xqa-panel .xqa-controls{justify-content:space-between;flex-wrap:wrap} #xqa-panel .xqa-controls label{display:flex;align-items:center;gap:5px} #xqa-panel [data-auto],#xqa-panel [data-auto-move]{width:auto;margin:0;accent-color:#d5a75e}
    #xqa-panel .xqa-auto-note{font-size:11px;color:#cbb390}
    #xqa-panel [data-action="analyze"]{background:#a66530;border-color:#d09151;color:#fff8e8;font-weight:700} #xqa-panel [data-action="analyze"]:hover{background:#bd793a}
    #xqa-panel .xqa-note{color:#cbb390;font-size:11px;margin:3px 0 10px}
    #xqa-panel .xqa-board-frame{overflow:hidden;border:1px solid #c59a61;border-radius:10px;background:#a8763d;box-shadow:0 3px 12px #0005}
    #xqa-panel .xqa-board-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:34px;padding:5px 9px;background:#5b3f25;color:#f0dbb7;font-size:11px}
    #xqa-panel [data-board-advice]{font-size:12px;color:#ffe4a8;text-align:right} #xqa-panel [data-board-advice].xqa-has-advice{font-size:13px;color:#fff0ba}
    #xqa-panel .xqa-position{position:relative;display:grid;grid-template-columns:repeat(9,minmax(0,1fr));grid-template-rows:repeat(10,minmax(0,1fr));aspect-ratio:9/10;gap:0;padding:0;background:radial-gradient(circle at 28% 18%,#f2d9a5,#dbaf72 68%,#c99154);touch-action:manipulation}
    #xqa-panel .xqa-board-lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0}
    #xqa-panel .xqa-square{position:relative;z-index:1;width:100%;height:100%;min-width:0;padding:0;border:0;border-radius:50%;background:transparent;color:#33271c;display:grid;place-items:center}
    #xqa-panel .xqa-square:hover{background:#fff3c755} #xqa-panel .xqa-square[data-selected="true"]{outline:2px solid #33a974;outline-offset:-3px;background:#e6fff044;z-index:2}
    #xqa-panel .xqa-square[data-hint="from"]{background:#f7cf6755;box-shadow:inset 0 0 0 3px #eeaf40} #xqa-panel .xqa-square[data-hint="to"]{background:#72d9a555;box-shadow:inset 0 0 0 3px #38b77b}
    #xqa-panel .xqa-token{display:grid;place-items:center;width:84%;aspect-ratio:1;border-radius:50%;font:700 clamp(15px,2.3vw,21px)/1.1 'Microsoft YaHei',serif;box-shadow:0 2px 3px #0005,0 1px 1px #fff8 inset}
    #xqa-panel .xqa-token[data-side="r"]{background:radial-gradient(circle at 30% 22%,#fff9e9,#e7c49c);border:2px solid #b9503a;color:#ac302a;text-shadow:0 1px #fff9}
    #xqa-panel .xqa-token[data-side="b"]{background:radial-gradient(circle at 30% 22%,#63605a,#292722);border:2px solid #171713;color:#fff1d6;text-shadow:0 1px #000}
    #xqa-panel .xqa-arrow{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;overflow:visible;filter:drop-shadow(0 1px 2px #251507aa)}
    #xqa-panel .xqa-palette{display:grid;gap:5px;margin:10px 0} #xqa-panel .xqa-palette-heading{display:flex;align-items:center;justify-content:space-between;color:#cbb390;font-size:11px} #xqa-panel .xqa-palette-row{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
    #xqa-panel .xqa-palette-label{width:28px;flex:none;font-size:11px;font-weight:700;color:#d5b990} #xqa-panel .xqa-piece{width:37px;height:37px;padding:2px;display:grid;place-items:center}
    #xqa-panel .xqa-piece .xqa-token{width:28px;font-size:16px;border-width:1px} #xqa-panel .xqa-piece[data-piece="clear"]{width:auto;height:27px;font-size:11px;color:#dac9ad}
    #xqa-panel [data-results]{padding:8px 9px;background:#302820;border-left:3px solid #bc8f57;border-radius:5px;color:#d9c5a8;font-size:12px;white-space:normal} #xqa-panel [data-results]:empty{display:none}
    #xqa-panel.xqa-folded{width:185px} #xqa-panel.xqa-folded .xqa-body{display:none}
  `;
  document.documentElement.append(style, panel);
  try { if (localStorage.getItem('xqa-player-side') === 'b') panel.querySelector('[data-player]').value = 'b'; } catch (_error) { /* 隐私模式下仍可在本页选择执棋方。 */ }
  try { const mode = localStorage.getItem('xqa-battle-mode'); if (mode === 'pve' || mode === 'pvp') panel.querySelector('[data-battle-mode]').value = mode; } catch (_error) { /* 本页仍可手动切换模式。 */ }

  let board = Array(90).fill('.');
  let boardFlipped = false;
  let turn = 'r';
  let selected = -1;
  let recommendation = null;
  let recommendationContext = null;
  let lastLiveKey = '';
  let lastLiveSnapshot = null;
  let trackingBusy = false;
  let autoMoveBusy = false;
  let lastAutoMoveKey = '';
  let analysisRequest = null;
  let analysisGeneration = 0;
  let retryAutoAnalysis = false;
  let lastAnalysisAttempt = 0;
  let cachedScene = null;
  let cachedBattleNode = null;
  let cachedChessLayer = null;
  let cachedPvpComponent = null;
  let cachedModePreference = null;

  function findActiveBattleNode() {
    const root = gameWindow.cc?.director?.getScene?.();
    if (!root) throw new Error('游戏场景尚未载入。');
    const preference = panel.querySelector('[data-battle-mode]').value;
    if (cachedScene === root && cachedModePreference === preference && cachedBattleNode?.activeInHierarchy && cachedChessLayer?.activeInHierarchy) return cachedBattleNode;
    cachedScene = root;
    cachedModePreference = preference;
    cachedBattleNode = null;
    cachedChessLayer = null;
    cachedPvpComponent = null;
    const candidates = [];
    function walk(node) {
      if (!node.activeInHierarchy) return;
      const children = node.children || [];
      const possibleLayer = node.name === 'ChessManLayer' || children.length >= 2 && children.length <= 40 && children.some(child => child.children?.some(part => part.name === 'ChessSpine'));
      if (possibleLayer) {
        let battle = root;
        for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
          if (/^MySceneNode</i.test(ancestor.name || '')) { battle = ancestor; break; }
        }
        const name = battle.name || '';
        const namedMode = /pvp/i.test(name) ? 'pvp' : /pve|aibattle/i.test(name) ? 'pve' : null;
        let count = 0, redKing = false, blackKing = false;
        for (const piece of children) {
          if (!piece.activeInHierarchy) continue;
          const spine = piece.children?.find(child => child.name === 'ChessSpine');
          const skin = spine?.components?.find(component => typeof component.defaultSkin === 'string')?.defaultSkin;
          if (!skin) continue;
          count++;
          if (skin === 'redShuai') redKing = true;
          if (skin === 'blackShuai') blackKing = true;
        }
        const modeMatch = preference === 'auto' || !namedMode || preference === namedMode;
        if (modeMatch && (node.name === 'ChessManLayer' || redKing && blackKing)) {
          candidates.push({ battle, layer: node, score: count + (redKing && blackKing ? 100 : 0) + (node.name === 'ChessManLayer' ? 20 : 0) + (namedMode === preference ? 10 : 0) });
        }
      }
      for (const child of children) walk(child);
    }
    walk(root);
    candidates.sort((a, b) => b.score - a.score);
    const found = candidates[0];
    if (!found) throw new Error(`未找到${preference === 'pve' ? '人机' : preference === 'pvp' ? '真人' : '当前'}对局的棋子层，请确认已进入棋盘。`);
    cachedChessLayer = found.layer;
    cachedBattleNode = found.battle;
    return cachedBattleNode;
  }

  function findDescendant(root, name) {
    if (root.name === name && root.activeInHierarchy) return root;
    for (const child of root.children || []) {
      const result = findDescendant(child, name);
      if (result) return result;
    }
    return null;
  }

  function boardGeometry(layer, mode, entries) {
    const candidates = [];
    function add(file, rank, anchorX = 0.5, anchorY = 0.5) {
      if ([file, rank, anchorX, anchorY].every(Number.isFinite) && file > 0 && rank > 0) {
        candidates.push({ file, rank, originX: (anchorX - 4.5) * file, originY: (anchorY - 5) * rank });
      }
    }
    // 棋盘组件的格距和格点偏移比棋子层的外框尺寸更可靠。
    for (let node = layer; node; node = node.parent) {
      const boardControl = node.components?.find(component => component.ud === layer && (component.cellSize || component.Dd));
      if (!boardControl) continue;
      const cell = boardControl.cellSize || boardControl.Dd;
      add(Number(cell.width), Number(cell.height), Number(boardControl.Sq?.x ?? 0.5), Number(boardControl.Sq?.y ?? 0.5));
      break;
    }
    // 人机棋盘旧版使用 68 的本地格距；真人棋盘从实际尺寸读取。
    if (mode === 'pve') add(68, 68);
    const uiTransform = gameWindow.cc?.UITransform;
    const size = layer.getContentSize?.() || (uiTransform && layer.getComponent?.(uiTransform)?.contentSize) || layer;
    add(Number(size?.width) / 9, Number(size?.height) / 10);
    if (mode === 'pvp') add(68, 68);
    for (const geometry of candidates) {
      if (!entries || entries.every(entry => {
        const file = (entry.x - geometry.originX) / geometry.file;
        const rank = (entry.y - geometry.originY) / geometry.rank;
        return file >= -0.08 && file <= 8.08 && rank >= -0.08 && rank <= 9.08 &&
          Math.abs(file - Math.round(file)) <= 0.08 && Math.abs(rank - Math.round(rank)) <= 0.08;
      })) return geometry;
    }
    throw new Error(candidates.length ? '棋盘格距与棋子位置不一致，请等待棋子停止移动后重试。' : '无法读取棋盘格子大小。');
  }

  function findBoardCamera(layer) {
    const cc = gameWindow.cc;
    for (let node = layer; node; node = node.parent) {
      const camera = node.getComponent?.(cc.Canvas)?.cameraComponent;
      if (camera && camera.enabledInHierarchy !== false) return camera;
    }
    const cameras = cc.director.getScene()?.getComponentsInChildren?.(cc.Camera) || [];
    return cameras.find(camera => camera.enabledInHierarchy !== false && camera.node?.activeInHierarchy && (camera.visibility & layer.layer)) || null;
  }

  function redAtBottomOnScreen(layer, redKing, blackKing) {
    function worldPosition(entry) {
      if (typeof entry.node.getWorldPosition === 'function') return entry.node.getWorldPosition();
      if (typeof layer.convertToWorldSpaceAR === 'function') return layer.convertToWorldSpaceAR(entry.node.position);
      return entry.node.position;
    }
    const redWorld = worldPosition(redKing);
    const blackWorld = worldPosition(blackKing);
    const camera = findBoardCamera(layer);
    const redY = camera?.worldToScreen ? camera.worldToScreen(redWorld).y : redWorld.y;
    const blackY = camera?.worldToScreen ? camera.worldToScreen(blackWorld).y : blackWorld.y;
    if (!Number.isFinite(redY) || !Number.isFinite(blackY) || Math.abs(redY - blackY) < 1) throw new Error('无法确定棋盘在屏幕上的朝向。');
    return redY < blackY;
  }

  function findPvpComponent(root) {
    if (cachedPvpComponent?.node?.activeInHierarchy) return cachedPvpComponent;
    let found = null;
    function walk(node) {
      if (!node.activeInHierarchy || found) return;
      found = node.components?.find(component => component._boardControl && component._myPlayerInfoBar && component._otherPlayerInfoBat) || null;
      if (!found) for (const child of node.children || []) walk(child);
    }
    walk(root);
    cachedPvpComponent = found;
    return found;
  }

  function readPvpTurn(root) {
    const battle = findPvpComponent(root);
    const color = battle?._boardControl?.Wb;
    const ownSide = color === 1 ? 'r' : color === 2 ? 'b' : null;
    const myClock = battle?._myPlayerInfoBar?.vI;
    const otherClock = battle?._otherPlayerInfoBat?.vI;
    const turn = battle?.isGamePlaying === true && ownSide && typeof myClock === 'boolean' && typeof otherClock === 'boolean' && myClock !== otherClock
      ? (myClock ? ownSide : ownSide === 'r' ? 'b' : 'r') : null;
    return { turn, ownSide, gameId: battle?.ugb ?? null };
  }

  function readLivePosition() {
    const root = findActiveBattleNode();
    const layer = cachedChessLayer?.activeInHierarchy ? cachedChessLayer : findDescendant(root, 'ChessManLayer');
    if (!layer) throw new Error('没有找到正在显示的棋子层。');
    cachedChessLayer = layer;
    const preference = panel.querySelector('[data-battle-mode]').value;
    const mode = preference === 'auto'
      ? (/pve|aibattle/i.test(root.name || '') ? 'pve' : /pvp/i.test(root.name || '') || findPvpComponent(root) ? 'pvp' : 'pve')
      : preference;
    const entries = [];
    for (const node of layer.children || []) {
      if (!node.activeInHierarchy) continue;
      const spine = node.children?.find(child => child.name === 'ChessSpine');
      const skin = spine?.components?.find(component => typeof component.defaultSkin === 'string')?.defaultSkin;
      if (!skin) throw new Error('棋子贴图仍在载入，请稍后重试。');
      const team = skin.startsWith('red') ? 'r' : skin.startsWith('black') ? 'b' : null;
      const type = skin.slice(team === 'r' ? 3 : 5);
      const fenPiece = SKIN_TYPES[type];
      if (!team || !fenPiece) throw new Error(`未知棋子贴图：${skin}`);
      entries.push({ team, fenPiece, x: node.position.x, y: node.position.y, type, node });
    }
    if (entries.length < 2 || entries.length > 32) throw new Error('棋子正在载入或移动，请稍后重试。');
    const geometry = boardGeometry(layer, mode, entries);
    const redKing = entries.find(entry => entry.team === 'r' && entry.type === 'Shuai');
    const blackKing = entries.find(entry => entry.team === 'b' && entry.type === 'Shuai');
    if (!redKing || !blackKing) throw new Error('未找到双方将帅，请稍后重试。');
    const redAtBottomInLayer = redKing.y < blackKing.y;
    const screenRedAtBottom = redAtBottomOnScreen(layer, redKing, blackKing);
    const next = Array(90).fill('.');
    for (const entry of entries) {
      const xGrid = (entry.x - geometry.originX) / geometry.file;
      const yGrid = (entry.y - geometry.originY) / geometry.rank;
      if (Math.abs(xGrid - Math.round(xGrid)) > 0.08 || Math.abs(yGrid - Math.round(yGrid)) > 0.08) {
        throw new Error('棋子正在移动，请稍后重试。');
      }
      const col = redAtBottomInLayer ? Math.round(xGrid) : 8 - Math.round(xGrid);
      const row = redAtBottomInLayer ? 9 - Math.round(yGrid) : Math.round(yGrid);
      if (!inside(row, col) || next[idx(row, col)] !== '.') throw new Error('棋盘坐标暂时无法确定，请稍后重试。');
      next[idx(row, col)] = entry.team === 'r' ? entry.fenPiece : entry.fenPiece.toLowerCase();
    }
    let ply = null;
    function readPly(node) {
      if (!node.activeInHierarchy || ply !== null) return;
      for (const component of node.components || []) {
        if (typeof component.string === 'string' && /^\d+步$/.test(component.string)) {
          ply = Number.parseInt(component.string, 10);
          return;
        }
      }
      for (const child of node.children || []) readPly(child);
    }
    if (mode === 'pve') {
      readPly(root);
      if (ply === null && cachedScene && cachedScene !== root) readPly(cachedScene);
    }
    const pvp = mode === 'pvp' ? readPvpTurn(root) : null;
    return { board: next, turn: pvp ? pvp.turn : ply === null ? null : ply % 2 === 0 ? 'r' : 'b', ply, pieceCount: entries.length, redAtBottomInLayer, redAtBottomOnScreen: screenRedAtBottom, mode, geometry, ownSide: pvp?.ownSide || null, gameId: pvp?.gameId ?? root.uuid ?? root.name };
  }

  function liveKey(snapshot) { return `${snapshot.mode}:${snapshot.gameId}:${snapshot.board.join('')}:${snapshot.turn || '?'}:${snapshot.ply ?? '?'}:${snapshot.redAtBottomInLayer}:${snapshot.redAtBottomOnScreen}`; }
  async function readStableLive() {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const first = readLivePosition();
        await new Promise(resolve => setTimeout(resolve, 180));
        const second = readLivePosition();
        if (liveKey(first) === liveKey(second)) return second;
      } catch (error) {
        if (attempt === 4) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 180));
    }
    throw new Error('棋盘仍在变化，请稍后重试。');
  }
  function liveAnalysisContext() {
    const snapshot = lastLiveSnapshot;
    if (!snapshot || !snapshot.turn || snapshot.turn !== turn || snapshot.turn !== panel.querySelector('[data-player]').value) return null;
    if (snapshot.mode === 'pvp' && snapshot.ownSide !== snapshot.turn) return null;
    if (liveKey(snapshot) !== lastLiveKey || board.some((piece, i) => piece !== snapshot.board[i])) return null;
    const fen = makeFen();
    if (panel.querySelector('[data-fen]').value.trim() !== fen) return null;
    return { key: lastLiveKey, fen, side: snapshot.turn };
  }
  function gameCanvasPoint(layer, square, snapshot) {
    const cc = gameWindow.cc;
    const canvas = document.querySelector('#GameCanvas');
    const rect = canvas?.getBoundingClientRect();
    if (!cc || !canvas || !rect?.width || !rect.height || !canvas.width || !canvas.height) throw new Error('无法定位游戏画布。');
    const row = Math.floor(square / 9), col = square % 9;
    const geometry = snapshot.geometry;
    const file = snapshot.redAtBottomInLayer ? col : 8 - col;
    const rank = snapshot.redAtBottomInLayer ? 9 - row : row;
    const local = cc.v3(geometry.originX + file * geometry.file, geometry.originY + rank * geometry.rank, 0);
    const transform = layer.getComponent?.(cc.UITransform) || layer._getUITransformComp?.();
    let world;
    if (transform) world = transform.convertToWorldSpaceAR(local);
    else {
      const matrix = new cc.Mat4();
      layer.getWorldMatrix(matrix);
      world = cc.Vec3.transformMat4(new cc.Vec3(), local, matrix);
    }
    const camera = findBoardCamera(layer);
    if (!camera?.worldToScreen) throw new Error('无法定位棋盘摄像机。');
    const screen = camera.worldToScreen(world);
    const x = rect.left + screen.x * rect.width / canvas.width;
    const y = rect.bottom - screen.y * rect.height / canvas.height;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(screen.z) || screen.z < 0 || screen.z > 1 || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) throw new Error('推荐走法超出了游戏画布。');
    return { canvas, x, y };
  }
  function clickGameCanvas(point) {
    const options = { bubbles: true, cancelable: true, button: 0, clientX: point.x, clientY: point.y };
    point.canvas.dispatchEvent(new gameWindow.MouseEvent('mousedown', { ...options, buttons: 1 }));
    point.canvas.dispatchEvent(new gameWindow.MouseEvent('mouseup', { ...options, buttons: 0 }));
  }
  async function maybeAutoMove(context, advice, generation) {
    const toggle = panel.querySelector('[data-auto-move]');
    if (!toggle.checked || !context || !advice || autoMoveBusy || lastAutoMoveKey === context.key) return;
    autoMoveBusy = true;
    try {
      const snapshot = await readStableLive();
      if (!toggle.checked || generation !== analysisGeneration || recommendation !== advice || liveKey(snapshot) !== context.key || lastLiveKey !== context.key || makeFen() !== context.fen || panel.querySelector('[data-player]').value !== context.side) return;
      const { from, to } = advice.move;
      if (snapshot.turn !== context.side || snapshot.mode === 'pvp' && snapshot.ownSide !== context.side || side(snapshot.board[from]) !== context.side || side(snapshot.board[to]) === context.side) throw new Error('棋盘与推荐着法不一致。');
      const layer = cachedChessLayer;
      if (!layer?.activeInHierarchy) throw new Error('棋子层已经关闭。');
      const source = gameCanvasPoint(layer, from, snapshot);
      const target = gameCanvasPoint(layer, to, snapshot);
      if (!toggle.checked || generation !== analysisGeneration || lastLiveKey !== context.key) return;
      lastAutoMoveKey = context.key;
      panel.querySelector('[data-board-advice]').textContent = `自动落子 ${advice.notation}…`;
      clickGameCanvas(source);
      await new Promise(resolve => setTimeout(resolve, 120));
      if (!toggle.checked) return;
      clickGameCanvas(target);
      await new Promise(resolve => setTimeout(resolve, 700));
      const after = await readStableLive();
      if (liveKey(after) === context.key) throw new Error('游戏没有接受点击；请手动落子。');
      if (liveKey(after) !== lastLiveKey) applyLive(after);
    } catch (error) {
      toggle.checked = false;
      panel.querySelector('[data-board-advice]').textContent = '自动落子已暂停';
      showError(new Error(`自动落子已暂停：${error.message || error}`));
    } finally {
      autoMoveBusy = false;
    }
  }
  function applyLive(snapshot) {
    lastLiveSnapshot = snapshot;
    board = snapshot.board.slice();
    boardFlipped = !snapshot.redAtBottomOnScreen;
    if (snapshot.turn) turn = snapshot.turn;
    panel.querySelector('[data-turn]').value = turn;
    selected = -1;
    clearRecommendation();
    lastLiveKey = liveKey(snapshot);
    syncFen();
    drawBoard();
    showLiveAdvice(snapshot);
  }
  function showLiveAdvice(snapshot) {
    const playerSide = panel.querySelector('[data-player]').value;
    if (snapshot.mode === 'pvp' && snapshot.ownSide !== playerSide) {
      panel.querySelector('[data-board-advice]').textContent = snapshot.ownSide ? '请核对我执棋色' : '等待识别我的棋色';
      show(snapshot.ownSide ? `真人对战检测到你执${snapshot.ownSide === 'r' ? '红' : '黑'}棋；请将“我执”设为${snapshot.ownSide === 'r' ? '红方' : '黑方'}。` : '真人对战尚未识别你的棋色，等待对局开始。');
      return;
    }
    if (!snapshot.turn) {
      panel.querySelector('[data-board-advice]').textContent = snapshot.mode === 'pvp' ? '等待真人对战开始或恢复' : '请核对行棋方';
      show(snapshot.mode === 'pvp' ? '已识别棋盘，等待双方计时状态确定行棋方。' : `已识别 ${snapshot.pieceCount} 枚棋子；请核对轮到哪方。`);
      return;
    }
    if (snapshot.turn === playerSide) {
      show('');
      analyze();
    } else {
      panel.querySelector('[data-board-advice]').textContent = `等待${playerSide === 'r' ? '红' : '黑'}方行棋`;
      show(`已识别 ${snapshot.pieceCount} 枚棋子${snapshot.ply === null ? '' : `，当前 ${snapshot.ply} 步`}，轮到${snapshot.turn === 'r' ? '红' : '黑'}方。`);
    }
  }

  function idx(r, c) { return r * 9 + c; }
  function inside(r, c) { return r >= 0 && r < 10 && c >= 0 && c < 9; }
  function side(p) { return p === '.' ? null : (p === p.toUpperCase() ? 'r' : 'b'); }
  function parseFen(fen) {
    const parts = fen.trim().split(/\s+/);
    const rows = parts[0].split('/');
    if (rows.length !== 10) throw new Error('FEN 必须包含 10 行。');
    const next = [];
    for (const row of rows) {
      let count = 0;
      for (const ch of row) {
        if (/^[1-9]$/.test(ch)) { const n = Number(ch); count += n; for (let i = 0; i < n; i++) next.push('.'); }
        else if (/^[kabnrcpKABNRCP]$/.test(ch)) { count++; next.push(ch); }
        else throw new Error(`FEN 中有无法识别的字符：${ch}`);
      }
      if (count !== 9) throw new Error('FEN 每行必须对应 9 列。');
    }
    if (next.length !== 90) throw new Error('FEN 棋盘尺寸不正确。');
    return { board: next, turn: parts[1] === 'b' ? 'b' : 'r' };
  }
  function makeFen() {
    const rows = [];
    for (let r = 0; r < 10; r++) {
      let line = '', blanks = 0;
      for (let c = 0; c < 9; c++) {
        const p = board[idx(r, c)];
        if (p === '.') blanks++;
        else { if (blanks) line += blanks; blanks = 0; line += p; }
      }
      if (blanks) line += blanks;
      rows.push(line);
    }
    return `${rows.join('/')} ${turn === 'r' ? 'w' : 'b'}`;
  }
  function makeBoardArtwork(flipped) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'xqa-board-lines');
    svg.setAttribute('viewBox', '0 0 9 10');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const ranks = Array.from({ length: 8 }, (_, i) => `M.5 ${i + 1.5} H8.5`).join(' ');
    const files = Array.from({ length: 7 }, (_, i) => `M${i + 1.5} .5 V4.5 M${i + 1.5} 5.5 V9.5`).join(' ');
    const palace = 'M3.5 .5 L5.5 2.5 M5.5 .5 L3.5 2.5 M3.5 7.5 L5.5 9.5 M5.5 7.5 L3.5 9.5';
    const marks = [];
    for (const row of [2, 3, 6, 7]) {
      const columns = row === 2 || row === 7 ? [1, 7] : [0, 2, 4, 6, 8];
      for (const col of columns) {
        const x = col + .5, y = row + .5;
        for (const sx of col === 0 ? [1] : col === 8 ? [-1] : [-1, 1]) {
          for (const sy of [-1, 1]) marks.push(`M${x + sx * .12} ${y + sy * .26} L${x + sx * .12} ${y + sy * .12} L${x + sx * .26} ${y + sy * .12}`);
        }
      }
    }
    svg.innerHTML = `<g fill="none" stroke="#76512d" stroke-width=".035" stroke-linecap="square"><rect x=".5" y=".5" width="8" height="9"/><path d="${ranks} ${files} ${palace}"/></g><path d="${marks.join(' ')}" fill="none" stroke="#8a6238" stroke-width=".028"/><g fill="#704a27" font-family="KaiTi,STKaiti,serif" font-size=".56" font-weight="700" text-anchor="middle" dominant-baseline="middle" letter-spacing=".12"><text x="${flipped ? 6.5 : 2.5}" y="5">楚河</text><text x="${flipped ? 2.5 : 6.5}" y="5">汉界</text></g>`;
    return svg;
  }
  const boardArtworkRed = makeBoardArtwork(false);
  const boardArtworkBlack = makeBoardArtwork(true);
  function drawBoard() {
    const host = panel.querySelector('.xqa-position'); host.replaceChildren(boardFlipped ? boardArtworkBlack : boardArtworkRed);
    const advice = panel.querySelector('[data-board-advice]');
    advice.classList.toggle('xqa-has-advice', Boolean(recommendation));
    advice.textContent = recommendation ? `推荐 ${recommendation.notation} · ${formatScore(recommendation.score)}` : '等待分析';
    for (let displayIndex = 0; displayIndex < 90; displayIndex++) {
      const i = boardFlipped ? 89 - displayIndex : displayIndex;
      const p = board[i], cell = document.createElement('button'); cell.type = 'button'; cell.className = 'xqa-square'; cell.dataset.selected = String(i === selected); cell.title = `第${Math.floor(displayIndex / 9) + 1}行，第${displayIndex % 9 + 1}列${p === '.' ? '' : `，${side(p) === 'r' ? '红' : '黑'}方${glyph[p]}`}`;
      if (p !== '.') {
        const token = document.createElement('span'); token.className = 'xqa-token'; token.dataset.side = side(p); token.textContent = glyph[p]; cell.append(token);
      }
      if (recommendation) { if (i === recommendation.move.from) cell.dataset.hint = 'from'; else if (i === recommendation.move.to) cell.dataset.hint = 'to'; }
      cell.addEventListener('click', () => { selected = i; drawBoard(); });
      cell.addEventListener('contextmenu', e => { e.preventDefault(); board[i] = '.'; selected = -1; clearRecommendation(); syncFen(); drawBoard(); });
      host.append(cell);
    }
    if (recommendation) {
      const from = boardFlipped ? 89 - recommendation.move.from : recommendation.move.from;
      const to = boardFlipped ? 89 - recommendation.move.to : recommendation.move.to;
      const x1 = from % 9 + .5, y1 = Math.floor(from / 9) + .5, x2 = to % 9 + .5, y2 = Math.floor(to / 9) + .5;
      const length = Math.hypot(x2 - x1, y2 - y1), dx = (x2 - x1) / length, dy = (y2 - y1) / length;
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      arrow.setAttribute('class', 'xqa-arrow'); arrow.setAttribute('viewBox', '0 0 9 10'); arrow.setAttribute('preserveAspectRatio', 'none'); arrow.setAttribute('aria-hidden', 'true');
      arrow.innerHTML = `<defs><marker id="xqa-arrow-tip" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="#f8d768" stroke="#58321b" stroke-width=".35"/></marker></defs><line x1="${x1 + dx * .27}" y1="${y1 + dy * .27}" x2="${x2 - dx * .27}" y2="${y2 - dy * .27}" stroke="#513019" stroke-width=".18" stroke-linecap="round"/><line x1="${x1 + dx * .27}" y1="${y1 + dy * .27}" x2="${x2 - dx * .27}" y2="${y2 - dy * .27}" stroke="#f8d768" stroke-width=".11" stroke-linecap="round" marker-end="url(#xqa-arrow-tip)"/>`;
      host.append(arrow);
    }
  }
  function formatScore(score) { return Math.abs(score) >= MATE - 100 ? (score > 0 ? '将死' : '被将死') : `${score >= 0 ? '+' : ''}${(score / 100).toFixed(1)} 分`; }
  function clearRecommendation() {
    analysisGeneration++;
    try { analysisRequest?.abort?.(); } catch (_error) {/* 旧请求的结果仍会被代次检查忽略。 */ }
    analysisRequest = null;
    recommendation = null;
    recommendationContext = null;
    retryAutoAnalysis = false;
    panel.querySelector('[data-board-advice]').title = '';
  }
  function syncFen() { panel.querySelector('[data-fen]').value = makeFen(); }
  function loadFen() { const parsed = parseFen(panel.querySelector('[data-fen]').value); clearRecommendation(); board = parsed.board; turn = parsed.turn; panel.querySelector('[data-turn]').value = turn; selected = -1; drawBoard(); }
  function renderPalette() {
    const host = panel.querySelector('.xqa-palette'); host.replaceChildren();
    const toolbar = document.createElement('div'); toolbar.className = 'xqa-palette-heading';
    const hint = document.createElement('span'); hint.textContent = '选中交点，再点棋子放置'; toolbar.append(hint);
    const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'xqa-piece'; clear.textContent = '清空格'; clear.dataset.piece = 'clear'; clear.addEventListener('click', () => { if (selected < 0) { show('先点棋盘格。'); return; } board[selected] = '.'; selected = -1; clearRecommendation(); syncFen(); drawBoard(); show(''); }); toolbar.append(clear); host.append(toolbar);
    for (const team of ['r', 'b']) {
      const row = document.createElement('div'); row.className = 'xqa-palette-row';
      const heading = document.createElement('span'); heading.className = 'xqa-palette-label'; heading.textContent = team === 'r' ? '红棋' : '黑棋'; row.append(heading);
      for (const [p, label] of PIECES.filter(([piece]) => side(piece) === team)) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'xqa-piece'; b.dataset.piece = p; b.title = `放置${team === 'r' ? '红' : '黑'}方${label}`;
        const token = document.createElement('span'); token.className = 'xqa-token'; token.dataset.side = team; token.textContent = label; b.append(token);
        b.addEventListener('click', () => { if (selected < 0) { show('先点棋盘格，再选择要放置的棋子。'); return; } board[selected] = p; selected = -1; clearRecommendation(); syncFen(); drawBoard(); show(''); }); row.append(b);
      }
      host.append(row);
    }
  }
  function show(html) { const host = panel.querySelector('[data-results]'); host.style.color = ''; host.innerHTML = html; }
  function showError(error) { const host = panel.querySelector('[data-results]'); host.style.color = '#ffb5a8'; host.textContent = String(error.message || error); }
  function analyze() {
    try {
      const parsed = parseFen(panel.querySelector('[data-fen]').value);
      clearRecommendation();
      board = parsed.board; turn = panel.querySelector('[data-turn]').value;
      syncFen(); drawBoard(); show('');
      const context = liveAnalysisContext();
      panel.querySelector('[data-board-advice]').textContent = '本机分析中…';
      panel.querySelector('[data-board-advice]').title = '';
      const timeMs = Number(panel.querySelector('[data-time-ms]').value);
      const generation = analysisGeneration;
      lastAnalysisAttempt = Date.now();
      const fail = (error, retry) => {
        if (generation !== analysisGeneration) return;
        analysisRequest = null;
        recommendation = null;
        recommendationContext = null;
        retryAutoAnalysis = retry;
        drawBoard();
        panel.querySelector('[data-board-advice]').textContent = retry ? '分析服务未连接' : '分析失败';
        showError(error);
      };
      analysisRequest = requestAnalysis({
        fen: makeFen(), timeMs,
        onload: response => {
          if (generation !== analysisGeneration) return;
          analysisRequest = null;
          let result;
          try { result = JSON.parse(response.responseText || '{}'); } catch (_error) { fail(new Error('本机服务返回的数据无法读取。'), false); return; }
          if (response.status !== 200) { fail(new Error(result.error || `本机服务返回 ${response.status}。`), response.status === 0 || response.status >= 500); return; }
          const best = result.best;
          if (best) {
            const from = Number(best.from), to = Number(best.to), score = Number(best.score);
            if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= 90 || to < 0 || to >= 90 || from === to || board[from] !== best.piece || !Number.isFinite(score) || typeof best.notation !== 'string') {
              fail(new Error('本机服务返回了无效走法。'), false); return;
            }
            recommendation = { move: { from, to }, notation: best.notation, score };
            recommendationContext = context;
          } else { recommendation = null; recommendationContext = null; }
          retryAutoAnalysis = false;
          drawBoard();
          panel.querySelector('[data-board-advice]').title = `实际搜索深度 ${result.depth_reached || 0}；耗时 ${result.elapsed_ms || 0} 毫秒`;
          if (!best) panel.querySelector('[data-board-advice]').textContent = '当前方无合法走法';
          show('');
          if (best) void maybeAutoMove(context, recommendation, generation);
        },
        onerror: () => fail(new Error('无法连接本机分析服务。请先运行 xiangqi_advisor_server.py。'), true),
        ontimeout: () => fail(new Error('本机分析超时，请重试。'), true)
      });
    } catch (error) { clearRecommendation(); drawBoard(); showError(error); }
  }

  panel.querySelector('[data-turn]').addEventListener('change', e => { turn = e.target.value; clearRecommendation(); syncFen(); drawBoard(); });
  panel.querySelector('[data-time-ms]').addEventListener('change', () => { clearRecommendation(); drawBoard(); });
  panel.querySelector('[data-player]').addEventListener('change', e => {
    try { localStorage.setItem('xqa-player-side', e.target.value); } catch (_error) { /* 本页设置仍然有效。 */ }
    clearRecommendation();
    drawBoard();
    show('');
    const snapshot = lastLiveSnapshot;
    if (snapshot && (snapshot.turn === null || snapshot.turn === turn) && board.every((piece, i) => piece === snapshot.board[i]) && panel.querySelector('[data-fen]').value.trim() === makeFen()) showLiveAdvice(snapshot);
  });
  panel.querySelector('[data-battle-mode]').addEventListener('change', e => {
    try { localStorage.setItem('xqa-battle-mode', e.target.value); } catch (_error) { /* 本页设置仍然有效。 */ }
    cachedModePreference = null;
    cachedBattleNode = null;
    cachedChessLayer = null;
    cachedPvpComponent = null;
    lastLiveSnapshot = null;
    lastLiveKey = '';
    lastAutoMoveKey = '';
    clearRecommendation();
    drawBoard();
    panel.querySelector('[data-board-advice]').textContent = '等待识别';
    show(`已切换到${e.target.selectedOptions[0].textContent}，正在等待棋盘。`);
  });
  panel.querySelector('[data-action="load"]').addEventListener('click', () => { try { loadFen(); show('局面已载入。'); } catch (e) { showError(e); } });
  panel.querySelector('[data-action="analyze"]').addEventListener('click', analyze);
  panel.querySelector('[data-fen]').addEventListener('input', () => { clearRecommendation(); drawBoard(); });
  panel.querySelector('[data-auto]').addEventListener('change', e => { if (e.target.checked) lastLiveKey = ''; });
  panel.querySelector('[data-auto-move]').addEventListener('change', e => {
    if (!e.target.checked) return;
    panel.querySelector('[data-auto]').checked = true;
    lastAutoMoveKey = '';
    if (recommendation) void maybeAutoMove(recommendationContext, recommendation, analysisGeneration);
    else lastLiveKey = '';
  });
  panel.querySelector('[data-action="recognize"]').addEventListener('click', async () => {
    if (trackingBusy) return;
    trackingBusy = true;
    show('正在识别棋盘…');
    try { applyLive(await readStableLive()); } catch (error) { showError(error); } finally { trackingBusy = false; }
  });
  setInterval(async () => {
    if (!panel.querySelector('[data-auto]').checked || trackingBusy || autoMoveBusy) return;
    trackingBusy = true;
    try {
      const snapshot = await readStableLive();
      if (liveKey(snapshot) !== lastLiveKey) applyLive(snapshot);
      else if (retryAutoAnalysis && !analysisRequest && Date.now() - lastAnalysisAttempt >= 8000 && snapshot.turn === panel.querySelector('[data-player]').value && (snapshot.mode !== 'pvp' || snapshot.ownSide === snapshot.turn) && turn === snapshot.turn && board.every((piece, i) => piece === snapshot.board[i]) && panel.querySelector('[data-fen]').value.trim() === makeFen()) analyze();
    }
    catch (_error) {/* 切换场景或落子动画期间等待下一次轮询。 */ }
    finally { trackingBusy = false; }
  }, 1200);
  panel.querySelector('[data-action="fold"]').addEventListener('click', () => panel.classList.toggle('xqa-folded'));
  panel.querySelector('[data-fen]').addEventListener('keydown', e => { if (e.key === 'Enter') try { loadFen(); show('局面已载入。'); } catch (err) { showError(err); } });
  renderPalette(); loadFen();
})();
