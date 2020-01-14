import { debounceTime, delay, filter, map, tap } from 'rxjs/internal/operators';
import { myLogger } from './logger';
import { ofTopic } from './event-source';
import { toTopic } from './event-sink';
import { combineLatest, of } from 'rxjs';

interface Button {
    battery: number;
    voltage: number;
    linkquality: number;
    click: 'single' | 'double' | 'triple' | 'quadruple';
}

interface MotionSensor {
    battery: number;
    voltage: number;
    illuminance: number;
    linkquality: number;
    occupancy: boolean;
}

const egFlur = toTopic('cmnd/eg-flur/POWER');

ofTopic<Button>('zigbee2mqtt/Kellerabgang_Button')
    .pipe(
        tap(val => myLogger.debug(`received on topic ${val.topic}: ${JSON.stringify(val.message)}`)),
        map(val => val.message.click)
    )
    .subscribe(val => {
        myLogger.info(`${val}`);
        if (val === 'single') {
            egFlur.next('TOGGLE');
        } else if (val === 'double') {
            egFlur.next('ON');
        } else if (val === 'triple') {
            egFlur.next('OFF');
        }
    });

const staircaseMotion = ofTopic<MotionSensor>('zigbee2mqtt/OG_Treppenhaus_Bewegung');
const staircaseLight = ofTopic<string>('stat/treppenhaus/POWER');

combineLatest([staircaseMotion, staircaseLight])
    .pipe(
        debounceTime(5000),
        filter(([motion, light]) => motion.message.illuminance < 15),
        filter(([motion, light]) => light.message === 'OFF')
    )
    .subscribe(_ => {
        egFlur.next('ON');
        of(undefined)
            .pipe(delay(60000))
            .subscribe(__ => egFlur.next('OFF'));
    });
