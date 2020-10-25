import { debounceTime, distinctUntilChanged, filter, map, scan, startWith, tap, withLatestFrom } from 'rxjs/internal/operators';
import { myLogger } from './logger';
import { MqttMessage, ofTopic } from './event-source';
import { toTopic } from './event-sink';
import { combineLatest, interval, merge } from 'rxjs';

export interface Button {
    battery: number;
    voltage: number;
    linkquality: number;
    click: 'single' | 'double' | 'triple' | 'quadruple';
}

export interface MotionSensor {
    battery: number;
    voltage: number;
    illuminance: number;
    linkquality: number;
    occupancy: boolean;
    occurrance?: Date;
}

export interface LightStatus {
    status: 'ON' | 'OFF';
    switchOffAt?: Date;
}

const ticker = interval(5000);
const toEgFlur = toTopic('cmnd/eg-flur/POWER');
const toOgFlur = toTopic('cmnd/og-flur/POWER');
const toStaircase = toTopic('cmnd/treppenhaus/POWER');
const toBasement = toTopic('cmnd/kg-flur/POWER');

const ofEgFlur = ofTopic<string>('stat/eg-flur/POWER')
    .pipe(startWith({topic: '', message: 'OFF'} as MqttMessage<string>));

const ofButtonSchlafzimmer = ofTopic<Button>('zigbee2mqtt/OG_Button_Schlafzimmer');
const toOgSchlafzimmer = toTopic('cmnd/og-schlafzimmer/POWER');

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

ofButtonSchlafzimmer
    .pipe(
        tap(val => myLogger.debug(`received on topic ${val.topic}: ${JSON.stringify(val.message)}`)),
        map(val => val.message.click)
    )
    .subscribe(val => {
        myLogger.info(`${val}`);
        if (val === 'single') {
            toOgFlur.next('TOGGLE');
        } else if (val === 'double') {
            toOgSchlafzimmer.next('TOGGLE');
        } else if (val === 'triple') {
            toOgFlur.next('OFF');
            toOgSchlafzimmer.next('OFF');
        }
    });

const staircaseOGMotion = ofTopic<MotionSensor>('zigbee2mqtt/OG_Treppenhaus_Bewegung')
    .pipe(map(v => {
        v.message.occurrance = new Date();

        return v.message;
    }));
const staircaseEGMotion = ofTopic<MotionSensor>('zigbee2mqtt/EG_Treppenhaus_Bewegung');
const ofStaircaseLight = ofTopic<string>('stat/treppenhaus/POWER');
const toStaircaseLightTimer = toTopic<number>('cmnd/treppenhaus/RuleTimer1');

combineLatest([staircaseOGMotion, ofEgFlur, ticker])
    .pipe(
        scan((acc, [currentmotion, currentEgState]) => {
            const now = new Date();
            if (
                now.getHours() >= 3
                && now.getHours() <= 6
                && currentmotion.occupancy
                && currentmotion.illuminance < 10
            ) {
                acc.switchOffAt = new Date(currentmotion.occurrance.getTime() + 120000);
                acc.status = 'ON';
            } else if (acc.switchOffAt > new Date() && currentEgState.message === 'OFF') {
                acc.status = 'OFF';
                acc.switchOffAt = new Date();
            }

            if (acc.switchOffAt < new Date() && currentEgState.message === 'ON') {
                acc.status = 'OFF';
            }

            return {...acc};
        }, {status: 'OFF', switchOffAt: new Date()} as LightStatus),
        distinctUntilChanged((a, b) => a.status === b.status && a.switchOffAt.getTime() === b.switchOffAt.getTime())
    )
    .subscribe(value => {
            myLogger.info('Nightlight:', value);
            toEgFlur.next(value.status);
        }
    );

combineLatest([staircaseEGMotion, ofStaircaseLight])
    .pipe(
        debounceTime(5000),
        tap(([motion, light]) => myLogger.info(`Staircase Light prolonger ${JSON.stringify(motion)} ${light.message}`)),
        filter(([motion, light]) => motion.message.occupancy && light.message === 'ON')
    )
    .subscribe(_ => {
        myLogger.info('Staircase: Setting timer time');
        toStaircaseLightTimer.next(240);
    });

const dg02Motion = ofTopic<MotionSensor>('zigbee2mqtt/OG_Bad_Bewegung');
const ofNucPower = ofTopic<string>('stat/nuc/POWER')
    .pipe(startWith({topic: '', message: 'ON'} as MqttMessage<string>));
const toNucTimer = toTopic<number>('cmnd/nuc/RuleTimer1');

combineLatest([dg02Motion, ofNucPower])
    .pipe(
        debounceTime(5000),
        tap(([motion, nuc]) => myLogger.debug(`DG02 NUC prolonger ${JSON.stringify(motion)} ${nuc.message}`)),
        filter(([motion, nuc]) => motion.message.occupancy && nuc.message === 'ON')
    )
    .subscribe(_ => {
        myLogger.debug('Nuc: Setting timer time');
        toNucTimer.next(600);
    });

const fromKgAlle = ofTopic<string>('cmnd/keller_alle/power');
const fromKgFlur = ofTopic<string>('cmnd/kg-flur/POWER');
const fromKgFlurStatus = ofTopic<string>('stat/kg-flur/POWER');
const fromKgGarage = ofTopic<string>('stat/kg-garage-tuer/switch');
const fromKgGarageStatus = ofTopic<string>('stat/kg-garage/POWER');
const fromKg3aStatus = ofTopic<string>('stat/kg-03a/POWER');
const toKgGarage = toTopic<string>('cmnd/kg-garage/POWER');
const toKgGarageEvt = toTopic<string>('cmnd/kg-garage/EVENT');
const toKgFlur = toTopic<string>('cmnd/kg-flur/POWER');
const toKg02 = toTopic<string>('cmnd/kg-02/POWER');
const toKg03 = toTopic<string>('cmnd/kg-03/POWER');
const toKg03a = toTopic<string>('cmnd/kg-03a/POWER');
const toKg06 = toTopic<string>('cmnd/kg-06/POWER');

const fromKgGarageCmnd = ofTopic<string>('cmnd/kg-garage/POWER1')
    .pipe(
        map(message => ({...message, time: new Date().getTime()})),
        startWith({message: '', time: 0})
    );
const fromKgFlurCmnd = fromKgFlur
    .pipe(
        filter(cmnd => cmnd.message === 'TOGGLE'),
        debounceTime(100),
        withLatestFrom(fromKgFlurStatus),
        map(([_, message]) => ({...message, time: new Date().getTime()})),
        startWith({message: '', time: 0})
    );
const fromKg03Cmnd = ofTopic<string>('cmnd/kg-03a/POWER')
    .pipe(
        map(message => ({...message, time: new Date().getTime()})),
        startWith({message: '', time: 0})
    );

const kgFlurOff = fromKgFlurCmnd
    .pipe(
        distinctUntilChanged((m1, m2) => m1.message === m2.message),
        filter(status => status.message === 'OFF')
    );
const kgGarageOff = combineLatest([fromKgGarageStatus, fromKgGarageCmnd])
    .pipe(
        debounceTime(100),
        filter(([_, garageCmnd]) => ((new Date().getTime() - garageCmnd.time) > 1000)),
        map(([status]) => status),
        distinctUntilChanged((m1, m2) => m1.message === m2.message),
        filter(status => status.message === 'OFF')
    );
const kg03aOff = combineLatest([fromKg3aStatus, fromKg03Cmnd])
    .pipe(
        debounceTime(100),
        filter(([_, garageCmnd]) => ((new Date().getTime() - garageCmnd.time) > 1000)),
        map(([status]) => status),
        distinctUntilChanged((m1, m2) => m1.message === m2.message),
        filter(status => status.message === 'OFF')
    );

merge(kgFlurOff, kgGarageOff, kg03aOff)
    .pipe(
        tap(_ => toKg02.next('OFF')),
        tap(_ => toKgFlur.next('OFF')),
        tap(_ => toKgGarage.next('OFF')),
        tap(_ => toKg03.next('OFF')),
        tap(_ => toKg03a.next('OFF')),
        tap(_ => toKg06.next('OFF'))
    )
    .subscribe();

// fromKgGarage.pipe(
//     delay(200),
//     withLatestFrom(fromKgGarageStatus),
//     map(([_, status]) => status),
//     filter(status => status.message === 'OFF'),
//     tap(_ => toKg02.next('OFF')),
//     tap(_ => toKgFlur.next('OFF')),
//     tap(_ => toKg03.next('OFF')),
//     tap(_ => toKg03a.next('OFF')),
//     tap(_ => toKg06.next('OFF'))
// )
//     .subscribe();
//
// fromKg3a.pipe(
//     delay(200),
//     filter(status => status.message === 'OFF'),
//     tap(_ => toKg02.next('OFF')),
//     tap(_ => toKgFlur.next('OFF')),
//     tap(_ => toKg03.next('OFF')),
//     tap(_ => toKgGarage.next('OFF')),
//     tap(_ => toKg06.next('OFF'))
// )
//     .subscribe();
//
// interval(60000)
//     .pipe(
//         filter(_ => {
//             const hours = new Date().getHours();
//
//             return (hours === 7) || (hours === 17);
//         }),
//         debounce(_ => timer(Math.random() * 1000 * 600))
//     )
//     .subscribe(_ => {
//             myLogger.info('EG Flur ON');
//             toEgFlur.next('ON');
//         }
//     );
//
// interval(60000)
//     .pipe(
//         filter(_ => {
//             const hours = new Date().getHours();
//
//             return (hours === 8) || (hours === 22);
//         }),
//         debounce(_ => timer(Math.random() * 1000 * 600))
//     )
//     .subscribe(_ => {
//             myLogger.info('EG Flur OFF');
//             toEgFlur.next('OFF');
//         }
//     );
//
// interval(900000)
//     .pipe(
//         filter(_ => {
//             const hours = new Date().getHours();
//
//             return (hours === 17 && hours <= 22);
//         }),
//         debounce(_ => timer(Math.random() * 1000 * 600))
//     )
//     .subscribe(_ => {
//             myLogger.info('Treppenhaus on');
//             toStaircase.next('ON');
//         }
//     );
//
// interval(60000)
//     .pipe(
//         filter(_ => {
//             const hours = new Date().getHours();
//
//             return (hours === 6) || (hours === 19);
//         }),
//         debounce(_ => timer(Math.random() * 1000 * 600))
//     )
//     .subscribe(_ => {
//             myLogger.info('OG Flur ON');
//             toOgFlur.next('ON');
//         }
//     );
//
// interval(60000)
//     .pipe(
//         filter(_ => {
//             const hours = new Date().getHours();
//
//             return (hours === 8) || (hours === 21);
//         }),
//         debounce(_ => timer(Math.random() * 1000 * 600))
//     )
//     .subscribe(_ => {
//             myLogger.info('OG Flur OFF');
//             toOgFlur.next('OFF');
//         }
//     );
//
// interval(60000)
//     .pipe(
//         filter(_ => {
//             const hours = new Date().getHours();
//
//             return (hours === 3) || (hours === 18);
//         }),
//         debounce(_ => timer(Math.random() * 1000 * 300))
//     )
//     .subscribe(_ => {
//             myLogger.info('Basement ON');
//             toBasement.next('ON');
//         }
//     );
//
// interval(60000)
//     .pipe(
//         filter(_ => {
//             const hours = new Date().getHours();
//
//             return (hours === 4) || (hours === 19);
//         }),
//         debounce(_ => timer(Math.random() * 1000 * 300))
//     )
//     .subscribe(_ => {
//             myLogger.info('Basement OFF');
//             toBasement.next('OFF');
//         }
//     );
//
// interval(60000)
//     .pipe(
//         filter(_ => {
//             const hours = new Date().getHours();
//
//             return (hours === 23) || (hours === 9);
//         }),
//         debounce(_ => timer(Math.random() * 1000 * 300))
//     )
//     .subscribe(_ => {
//             toEgFlur.next('OFF');
//             toBasement.next('OFF');
//             toOgFlur.next('OFF');
//             toStaircase.next('OFF');
//         }
//     );

// interval(20000)
//     .pipe(
//         delay(Math.random() * 1000 * 10/* * 60 * 5 */),
//         filter(_ => {
//             const hours = new Date().getHours();
//
//             return (hours >= 7 && hours <= 9) || (hours >= 16 && hours <= 22);
//         }),
//         tap(_ => toBasement.next('ON')),
//         delay(Math.random() * 1000 * 10 /* * 30 */),
//         tap(_ => tostaircase.next('ON')),
//         delay(Math.random() * 1000 * 10 /* * 30 */),
//         tap(_ => toEgFlur.next('ON')),
//         delay(Math.random() * 1000 * 10/* * 30 */),
//         tap(_ => toOgFlur.next('ON')),
//         delay(Math.random() * 1000 * 10 /* * 30 */),
//         tap(_ => toOgFlur.next('OFF')),
//         delay(Math.random() * 1000 * 10 /* * 30 */),
//         tap(_ => toEgFlur.next('OFF')),
//         delay(Math.random() * 1000 * 10 /* * 30 */),
//         tap(_ => toBasement.next('OFF'))
//     )
//     .subscribe(_ => {
//         toOgFlur.next('OFF');
//         toEgFlur.next('OFF');
//         tostaircase.next('OFF');
//         toBasement.next('OFF');
//     });
