import { debounceTime, delay, filter, map, switchMapTo, tap } from 'rxjs/internal/operators';
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

const toEgFlur = toTopic('cmnd/eg-flur/POWER');
const ofEgFlur = ofTopic<string>('stat/eg-flur/POWER');

ofTopic<Button>('zigbee2mqtt/Kellerabgang_Button')
    .pipe(
        tap(val => myLogger.debug(`received on topic ${val.topic}: ${JSON.stringify(val.message)}`)),
        map(val => val.message.click)
    )
    .subscribe(val => {
        myLogger.info(`${val}`);
        if (val === 'single') {
            toEgFlur.next('TOGGLE');
        } else if (val === 'double') {
            toEgFlur.next('ON');
        } else if (val === 'triple') {
            toEgFlur.next('OFF');
        }
    });

const staircaseEGMotion = ofTopic<MotionSensor>('zigbee2mqtt/EG_Treppenhaus_Bewegung');
const staircaseOGMotion = ofTopic<MotionSensor>('zigbee2mqtt/OG_Treppenhaus_Bewegung');
const ofStaircaseLight = ofTopic<string>('stat/treppenhaus/POWER');
const toStaircaseLightTimer = toTopic<number>('cmd/treppenhaus/RuleTimer1');

combineLatest([staircaseOGMotion, ofStaircaseLight, ofEgFlur])
    .pipe(
        debounceTime(5000),
        tap(([motion, light, flur]) =>
            myLogger.info(`StaircaseOGMotion m:${JSON.stringify(motion)} staircasse: ${JSON.stringify(light)} hall ${JSON.stringify(flur)}`)
        ),
        filter(([motion]) => motion.message.illuminance < 10),
        filter(([motion]) => motion.message.occupancy),
        filter(([motion, light]) => light.message === 'OFF'),
        filter(([motion, light, flur]) => flur.message === 'OFF'),
        filter(_ => new Date().getHours() >= 3),
        filter(_ => new Date().getHours() <= 7),
        tap(_ => myLogger.info('Nightlight: Switching on')),
        tap(_ => toEgFlur.next('ON')),
        switchMapTo(
            of(undefined)
                .pipe(delay(60000))
        )
    )
    .subscribe(_ => {
        myLogger.info('Nightlight: Switching off');
        toEgFlur.next('OFF');
    });

combineLatest([staircaseEGMotion, ofStaircaseLight])
    .pipe(
        debounceTime(5000),
        tap(([motion, light]) => myLogger.info(`Staircase Light prolonger ${JSON.stringify(motion)} ${light.message}`)),
        filter(([motion, light]) => motion.message.occupancy),
        filter(([motion, light]) => light.message === 'ON')
    )
    .subscribe(_ => {
        myLogger.info('Staircase: Setting timer time');
        toStaircaseLightTimer.next(240);
    });
