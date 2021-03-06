import { Machine, interpret, assign, State, send, SpawnedActorRef } from "xstate";
import { TickScheduler } from "../shared/tickscheduler.ts";
import { Connection, ConnectionEvent } from "./connection.ts";
import { World, Diagnostics } from "../shared/ecs.ts";
import { WebGLRenderer, Renderer, RenderingSystem, RenderTerrain } from "./renderer.ts";
import { renderUi } from "./ui.tsx";
import { Identify } from "../shared/packets.ts";
import { Assets, AssetLoader } from "./assets.ts";
import { JoinScreen } from "./join-screen.ts";
import { Time } from "../shared/time.ts";

class Client {
  tickScheduler = new TickScheduler();

  world: World = new World().withSystem(RenderTerrain).withSystem(RenderingSystem);

  service = interpret(ClientStateMachine(this.world, Connection(`ws://${window.location.host}/game`)), {
    clock: this.tickScheduler,
  });

  constructor(private renderer: WebGLRenderer) {
    this.world.withResources(Time({ delta: 0 }), Assets(new AssetLoader("/sprites/")), Renderer(this.renderer));

    this.service.onTransition((state) => {
      renderUi(state, this.service.send);
    });
  }

  start() {
    this.service.start();

    let lastFrame = performance.now();

    const loop = (timestamp: number) => {
      const elapsed = timestamp - lastFrame;
      const delta = elapsed / 1000;

      this.tickScheduler.tick(elapsed);
      this.world.res(Time).delta = delta;
      this.world.execute();

      lastFrame = timestamp;
      window.requestAnimationFrame(loop);
    };

    window.requestAnimationFrame(loop);
  }
}

interface ClientStateContext {
  world: World;
  identityRejectReason?: string;
  socketQueue?: ClientEvent[];
  connRef?: SpawnedActorRef<ConnectionEvent>;
  diagnostics?: Diagnostics;
}

export type ClientEvent =
  | { type: "IDENTIFY"; nickname: string }
  | { type: "HELLO"; serverState: string[] }
  | { type: "IDENTITY_CONFIRM" }
  | { type: "IDENTITY_REJECT"; reason: string }
  | { type: "SOCKET_READY" }
  | { type: "OPEN_CONNECTION" }
  | { type: "UPDATE_DIAGNOSTICS" };

const ClientStateMachine = (world: World, connection: Connection) =>
  Machine<ClientStateContext, ClientEvent>({
    strict: true,
    initial: "unidentified",
    context: { world, diagnostics: undefined },
    invoke: [
      {
        id: "connection",
        src: connection,
      },
      {
        id: "diagnostics",
        src: () => (send) => {
          const timer = setInterval(() => send("UPDATE_DIAGNOSTICS"), 1000);
          return () => clearInterval(timer);
        },
      },
    ],
    states: {
      unidentified: {
        // @ts-ignore wrong xstate typings
        invoke: {
          id: "join-systems",
          src: JoinScreen,
          onError: (ctx: ClientStateContext, error: any) => {
            console.error(error);
          },
          data: {
            world: (ctx: ClientStateContext) => ctx.world,
          },
        },
        initial: "selecting_name",
        states: {
          selecting_name: {
            on: {
              IDENTIFY: {
                target: "waiting_for_confirm",
                actions: [
                  send({ type: "CONNECT" }, { to: "connection" }),
                  send(
                    (_, e) => ({
                      type: "SEND",
                      packet: Identify({ nickname: e.nickname }),
                    }),
                    { to: "connection" }
                  ),
                ],
              },
            },
          },
          waiting_for_confirm: {
            entry: assign({ identityRejectReason: (_) => undefined }),
            on: {
              IDENTITY_CONFIRM: "identified",
              IDENTITY_REJECT: {
                target: "selecting_name",
                actions: assign({
                  identityRejectReason: (_, e) => e.reason,
                }),
              },
            },
            after: {
              // timeout
              5000: {
                target: "selecting_name",
                actions: assign({
                  identityRejectReason: (_) => "timed out",
                }),
              },
            },
          },
          identified: {
            type: "final",
          },
        },
        onDone: "idle",
      },
      idle: {},
    },
    on: {
      UPDATE_DIAGNOSTICS: {
        actions: assign({
          diagnostics: (ctx) => ctx.world.diagnostics(),
        }),
      },
    },
  });

export type ClientState = State<ClientStateContext, ClientEvent>;

const renderer = new WebGLRenderer(window.document.getElementsByTagName("canvas")[0]!);

const client = new Client(renderer);
client.start();
