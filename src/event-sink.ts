import * as mqtt from 'mqtt';
import { myLogger } from './logger';
import { ReplaySubject, Subject } from 'rxjs';
import { mqttServerConfig } from './settings';
import shortid from 'shortid';

export interface MqttMessage<T> {
    topic: string;
    message: T;
}

export const toTopic = <T>(topic: string) => EventSink.toTopic<T>(topic);

export class EventSink<T> {
    private client: mqtt.MqttClient;
    private readonly output$$ = new ReplaySubject<T>(100);

    static toTopic<T>(topic: string): Subject<T> {
        const eventSink = new EventSink<T>();
        eventSink.init(topic);

        return eventSink.output$$;
    }

    private init(topic: string): void {
        this.client = mqtt.connect(mqttServerConfig.brokerUrl, {
            clientId: `MqttRuler Sink - ${shortid.generate()}`,
            keepalive: 60,
            password: mqttServerConfig.password,
            username: mqttServerConfig.username
        });

        this.client.on('connect', () => {
            myLogger.info('Connected');
            this.output$$.subscribe(message => {
                let stringMessage: string;
                stringMessage = typeof message === 'string' ? message : JSON.stringify(message);
                this.client.publish(topic, stringMessage);
            });
        });
        this.client.on('reconnect', () => {
            myLogger.info('Reconnected');
        });
        this.client.on('error', (error: any) => {
            myLogger.error(`Error ${error}`);
        });
        this.client.on('close', () => {
            myLogger.info('Closed');
        });
    }
}
