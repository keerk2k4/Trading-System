import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Kafka, Producer } from "kafkajs";
import { randomUUID } from "crypto";

interface UserRegisteredEvent {
  eventId: string;
  eventType: "USER_REGISTERED";
  eventTime: string;
  source: "auth-service";
  schemaVersion: 1;
  payload: {
    userId: string;
    username: string;
  };
}

@Injectable()
export class AccountProvisioningEventService implements OnModuleDestroy {
  private readonly topic = process.env.USER_REGISTERED_TOPIC || "user-registrations";
  private readonly kafkaBrokers = (process.env.KAFKA_BOOTSTRAP_SERVERS || "localhost:9092")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  private producer: Producer | null = null;
  private connected = false;

  private async getProducer(): Promise<Producer> {
    if (this.producer) {
      return this.producer;
    }

    const kafka = new Kafka({
      clientId: "auth-service",
      brokers: this.kafkaBrokers,
    });

    this.producer = kafka.producer();
    return this.producer;
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) {
      return;
    }

    const producer = await this.getProducer();
    await producer.connect();
    this.connected = true;
  }

  async publishUserRegistered(userId: string, username: string): Promise<void> {
    const event: UserRegisteredEvent = {
      eventId: randomUUID(),
      eventType: "USER_REGISTERED",
      eventTime: new Date().toISOString(),
      source: "auth-service",
      schemaVersion: 1,
      payload: {
        userId,
        username,
      },
    };

    await this.ensureConnected();
    await this.producer!.send({
      topic: this.topic,
      messages: [{ key: userId, value: JSON.stringify(event) }],
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.producer && this.connected) {
      await this.producer.disconnect();
      this.connected = false;
    }
  }
}
