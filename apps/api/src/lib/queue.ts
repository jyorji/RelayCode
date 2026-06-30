import amqplib, { type Channel, type ChannelModel, type ConsumeMessage } from "amqplib";

export const EXECUTION_QUEUE = "code-execution";

let connection: ChannelModel | undefined;
let channel: Channel | undefined;

export async function getChannel(): Promise<Channel> {
  if (channel) return channel;

  connection = await amqplib.connect(process.env.RABBITMQ_URL!);
  channel = await connection.createChannel();
  await channel.assertQueue(EXECUTION_QUEUE, { durable: true });

  connection.on("close", () => {
    connection = undefined;
    channel = undefined;
  });

  return channel;
}

export async function publishToQueue(queue: string, message: unknown) {
  const ch = await getChannel();
  ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
}

export async function consumeQueue(
  queue: string,
  onMessage: (payload: unknown, msg: ConsumeMessage) => Promise<void>,
) {
  const ch = await getChannel();
  await ch.consume(queue, (msg) => {
    if (!msg) return;
    void onMessage(JSON.parse(msg.content.toString()), msg)
      .then(() => ch.ack(msg))
      .catch((err) => {
        console.error("Failed to process queue message:", err);
        ch.nack(msg, false, false);
      });
  });
}
