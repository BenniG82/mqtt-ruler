import { debounce, debounceTime, delay, filter, map, switchMapTo, tap } from 'rxjs/internal/operators';
import { myLogger } from './logger';
import { ofTopic } from './event-source';
import { toTopic } from './event-sink';
import { combineLatest, interval, of, timer } from 'rxjs';

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
const toOgFlur = toTopic('cmnd/og-flur/POWER');
const toStaircase = toTopic('cmnd/treppenhaus/POWER');
const toBasement = toTopic('cmnd/kg-flur/POWER');

const ofEgFlur = ofTopic<string>('stat/eg-flur/POWER');

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

const staircaseEGMotion = ofTopic<MotionSensor>('zigbee2mqtt/EG_Treppenhaus_Bewegung');
const staircaseOGMotion = ofTopic<MotionSensor>('zigbee2mqtt/OG_Treppenhaus_Bewegung');
const ofStaircaseLight = ofTopic<string>('stat/treppenhaus/POWER');
const toStaircaseLightTimer = toTopic<number>('cmnd/treppenhaus/RuleTimer1');

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

interval(60000)
    .pipe(
        filter(_ => {
            const hours = new Date().getHours();

            return (hours === 7) || (hours === 17);
        }),
        debounce(_ => timer(Math.random() * 1000 * 600))
    )
    .subscribe(_ => {
            myLogger.info('EG Flur ON');
            toEgFlur.next('ON');
        }
    );

interval(60000)
    .pipe(
        filter(_ => {
            const hours = new Date().getHours();

            return (hours === 8) || (hours === 22);
        }),
        debounce(_ => timer(Math.random() * 1000 * 600))
    )
    .subscribe(_ => {
            myLogger.info('EG Flur OFF');
            toEgFlur.next('OFF');
        }
    );

interval(900000)
    .pipe(
        filter(_ => {
            const hours = new Date().getHours();

            return (hours === 17 && hours <= 22);
        }),
        debounce(_ => timer(Math.random() * 1000 * 600))
    )
    .subscribe(_ => {
            myLogger.info('Treppenhaus on');
            toStaircase.next('ON');
        }
    );

interval(60000)
    .pipe(
        filter(_ => {
            const hours = new Date().getHours();

            return (hours === 6) || (hours === 19);
        }),
        debounce(_ => timer(Math.random() * 1000 * 600))
    )
    .subscribe(_ => {
            myLogger.info('OG Flur ON');
            toOgFlur.next('ON');
        }
    );

interval(60000)
    .pipe(
        filter(_ => {
            const hours = new Date().getHours();

            return (hours === 8) || (hours === 21);
        }),
        debounce(_ => timer(Math.random() * 1000 * 600))
    )
    .subscribe(_ => {
            myLogger.info('OG Flur OFF');
            toOgFlur.next('OFF');
        }
    );

interval(60000)
    .pipe(
        filter(_ => {
            const hours = new Date().getHours();

            return (hours === 3) || (hours === 18);
        }),
        debounce(_ => timer(Math.random() * 1000 * 300))
    )
    .subscribe(_ => {
            myLogger.info('Basement ON');
            toBasement.next('ON');
        }
    );

interval(60000)
    .pipe(
        filter(_ => {
            const hours = new Date().getHours();

            return (hours === 4) || (hours === 19);
        }),
        debounce(_ => timer(Math.random() * 1000 * 300))
    )
    .subscribe(_ => {
            myLogger.info('Basement OFF');
            toBasement.next('OFF');
        }
    );

interval(60000)
    .pipe(
        filter(_ => {
            const hours = new Date().getHours();

            return (hours === 23) || (hours === 9);
        }),
        debounce(_ => timer(Math.random() * 1000 * 300))
    )
    .subscribe(_ => {
            toEgFlur.next('OFF');
            toBasement.next('OFF');
            toOgFlur.next('OFF');
            toStaircase.next('OFF');
        }
    );

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
