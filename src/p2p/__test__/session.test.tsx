import { P2PClientProtocol } from "../session";
import { P2PQueueMessage } from "../interfaces";
import { CommandType, ErrorCode, InternalP2PCommandType } from "../types";
import { ParamType } from "../../http/types";

const agedMessage = (ageing: number): P2PQueueMessage => ({
  p2pCommand: { commandType: CommandType.CMD_DOORBELL_SET_PAYLOAD, channel: 0 },
  nestedCommandType: ParamType.COMMAND_START_LIVESTREAM as unknown as CommandType,
  timestamp: Date.now() - ageing,
  p2pCommandType: InternalP2PCommandType.WithStringPayload,
});

const createSession = (sendQueue: Array<P2PQueueMessage>) => {
  // Bypass the constructor: only the send queue logic is under test.
  const session = Object.create(P2PClientProtocol.prototype);
  session.sendQueue = sendQueue;
  session.connected = true;
  session.messageStates = new Map();
  session.rawStation = { station_sn: "T0000000000000000" };
  session.energySavingDevice = false;
  session.emit = jest.fn();
  return session;
};

describe("P2PClientProtocol send queue", () => {
  it("drains every aged out command instead of only the first one", () => {
    const session = createSession([
      agedMessage(30 * 60 * 1000),
      agedMessage(29 * 60 * 1000),
      agedMessage(28 * 60 * 1000),
    ]);

    session.sendQueuedMessage();

    expect(session.sendQueue).toHaveLength(0);
    expect(session.emit).toHaveBeenCalledTimes(3);
    for (const call of session.emit.mock.calls) {
      expect(call[0]).toBe("command");
      expect(call[1].return_code).toBe(ErrorCode.ERROR_CONNECT_TIMEOUT);
    }
  });

  it("drains aged out pings without blocking the commands queued behind them", () => {
    const ping: P2PQueueMessage = {
      p2pCommand: { commandType: CommandType.CMD_PING },
      timestamp: Date.now() - 10 * 60 * 1000,
      p2pCommandType: InternalP2PCommandType.WithoutData,
    };
    const session = createSession([ping, agedMessage(5 * 60 * 1000)]);

    session.sendQueuedMessage();

    expect(session.sendQueue).toHaveLength(0);
    expect(session.emit).toHaveBeenCalledTimes(1);
  });
});
