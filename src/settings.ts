/**
 * Here we configure the mqtt server with the Homie topic layout, may be the same as the Tasmota mqtt server
 */
import { MqttServerConfig } from './interfaces';

export const mqttServerConfig: MqttServerConfig = {
    brokerUrl: 'mqtt://10.8.0.62',
    username: 'mqtt',
    password: 'password'
};
