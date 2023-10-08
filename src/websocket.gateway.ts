import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

const initData = {
  players: [],
  mainClient: undefined,
  moleIndex: undefined,
  gameStarted: false,
  score: 0,
  moleValue: 10,
  gameTime: 60000,
  gameTimer: null,
  gameInterval: null,
  lastClick: 62000,
  gameDifficulties: {
    EASY: 2000,
    MEDIUM: 1000,
    HARD: 500,
  },
};

@WebSocketGateway()
export class GameGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private data = {
    ...initData,
  };

  afterInit() {
    console.log('WebSocket Gateway initialized');
  }

  @SubscribeMessage('startGame')
  handleStartGame(client: Socket) {
    if (
      !this.data.gameStarted &&
      client.id === this.data.mainClient &&
      this.data.players.length >= 3
    ) {
      this.startGame();
    }
  }

  @SubscribeMessage('joinGame')
  handleJoinGame(client: Socket) {
    if (!this.data.gameStarted) {
      if (this.data.players.includes(client.id)) {
        client.emit('joinedGame', {
          message: 'You already joined the game.',
          clientId: client.id,
        });
        return;
      }
      if (this.data.players.length === 0 || !this.data.mainClient)
        this.data.mainClient = client.id;
      client.emit('joinedGame', {
        message: 'You joined the game.',
        clientId: client.id,
        mainClient: this.data.mainClient === client.id,
      });
      this.data.players.push(client.id);
      this.broadcastPlayers();
    } else {
      client.emit('gameInProgress', { message: 'Game is in progress.' });
    }
  }
  @SubscribeMessage('clickDevice')
  handleDeviceClick(client: Socket) {
    if (this.data.gameStarted) {
      if (this.data.moleIndex === client.id) {
        this.data.score += this.data.moleValue;
        this.data.lastClick = this.data.gameTime;
        this.server.emit('gameStarted', {
          mole: this.getNewMoleIndex(),
        });
        this.server.emit('scoreUpdate', { score: this.data.score });
        clearInterval(this.data.gameInterval);
        this.data.gameInterval = setInterval(() => {
          this.evaluateDifficulty();
        }, this.data.gameDifficulties.HARD);
      }
    }
  }

  @SubscribeMessage('resetGame')
  handlePlayersReset() {
    clearInterval(this.data.gameTimer);
    clearInterval(this.data.gameInterval);
    this.data = {
      ...initData,
      players: [],
    };
    this.server.emit('joinedGame', { clientId: null });
  }

  @SubscribeMessage('restartGame')
  handleRestartGame() {
    this.endGame();
    this.data.score = 0;
    this.data.gameTime = 60000;
    this.server.emit('gameRestarted');
  }

  @SubscribeMessage('debug')
  handleDebug() {
    this.debug();
  }

  private getNewMoleIndex() {
    const newMoleIndex =
      this.data.players[Math.floor(Math.random() * this.data.players.length)];
    if (newMoleIndex === this.data.moleIndex) return this.getNewMoleIndex();
    this.data.moleIndex = newMoleIndex;
    return newMoleIndex;
  }

  handleDisconnect(client: Socket) {
    this.data.players = this.data.players.filter(
      (player) => player !== client.id,
    );
    if (this.data.mainClient === client.id && this.data.players.length > 0)
      this.data.mainClient = this.data.players[0];
  }

  private startGame() {
    this.data.gameStarted = true;
    this.startGameTimer();
    this.server.emit('gameStarted', {
      mole: this.getNewMoleIndex(),
    });
    clearInterval(this.data.gameInterval);
    this.data.gameInterval = setInterval(() => {
      this.evaluateDifficulty();
    }, this.data.gameDifficulties.HARD);
  }

  private startGameTimer() {
    this.data.gameTimer = setInterval(() => {
      if (this.data.gameTime > 0) {
        this.data.gameTime -= 500;
        if (this.data.gameTime % 1000 === 0)
          this.server.emit('gameTimeUpdate', this.data.gameTime / 1000);
      } else {
        this.endGame();
      }
    }, 500);
  }

  private evaluateDifficulty() {
    if (!this.data.gameStarted) return;
    if (
      this.data.gameTime / 1000 < 30 &&
      this.data.gameTime % 500 === 0 &&
      this.data.lastClick - this.data.gameTime >= 500
    ) {
      console.log('HARD', this.data.gameTime);
      this.server.emit('gameStarted', {
        mole: this.getNewMoleIndex(),
      });
      return;
    }
    if (
      this.data.gameTime / 1000 < 45 &&
      this.data.gameTime % 1000 === 0 &&
      this.data.lastClick - this.data.gameTime >= 1000
    ) {
      console.log('MEDIUM', this.data.gameTime);
      this.server.emit('gameStarted', {
        mole: this.getNewMoleIndex(),
      });
      return;
    }
    if (
      this.data.gameTime % 2000 === 0 &&
      this.data.lastClick - this.data.gameTime >= 2000
    ) {
      console.log('EASY', this.data.gameTime);
      this.server.emit('gameStarted', {
        mole: this.getNewMoleIndex(),
      });
    }
  }

  private endGame() {
    this.data.gameStarted = false;
    if (this.data.gameTimer) {
      clearInterval(this.data.gameTimer);
      this.data.gameTimer = null;
      this.server.emit('endGame', {
        score: this.data.score,
      });
    }
  }

  private broadcastPlayers() {
    this.server.emit('players', { players: this.data.players.length });
  }

  private debug() {
    console.log(
      JSON.stringify(
        { ...this.data, gameTimer: undefined, gameInterval: undefined },
        null,
        2,
      ),
    );
  }
}
