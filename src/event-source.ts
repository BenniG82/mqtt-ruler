import * as mqtt from 'mqtt';
import { myLogger } from './logger';
import { Observable, Subject } from 'rxjs';
import { mqttServerConfig } from './settings';
import shortid from 'shortid';

export interface MqttMessage<T> {
    topic: string;
    message: T;
}

export const ofTopic = <T>(topic: string) => EventSource.ofTopic<T>(topic);

export class EventSource<T> {
    private client: mqtt.MqttClient;
    private readonly output$$ = new Subject<MqttMessage<T>>();

    static ofTopic<T>(topic: string): Observable<MqttMessage<T>> {
        const eventSource = new EventSource<T>();
        eventSource.init(topic);

        return eventSource.output$$.asObservable();
    }

    private init(topic: string): void {
        this.client = mqtt.connect(mqttServerConfig.brokerUrl, {
            clientId: `MqttRuler Source - ${shortid.generate()}`,
            keepalive: 60,
            password: mqttServerConfig.password,
            username: mqttServerConfig.username,
            reconnectPeriod: 2000,
            resubscribe: true
        });

        this.client.on('connect', () => {
            myLogger.info('Connected');
            this.client.subscribe(topic, (error: any) => {
                myLogger.info('Subscription success');
                if (error) {
                    myLogger.error(`Error: ${error}`);
                }
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
        this.client.on('message', (messageTopic: string, buffer: Buffer) => {
            myLogger.debug('Callback called');
            const messag = buffer.toString();
            let msg: any = messag;
            if (messag?.charAt(0) === '{' && messag?.charAt(messag?.length - 1) === '}') {
                msg = JSON.parse(messag);
            }
            this.output$$.next({
                topic: messageTopic,
                message: msg
            });
        });
    }
}
