import { map, tap } from 'rxjs/internal/operators';
import { myLogger } from './logger';
import { ofTopic } from './event-source';
import { toTopic } from './event-sink';

interface ButtonTopic {
    battery: number;
    voltage: number;
    linkquality: number;
    click: 'single' | 'double' | 'triple' | 'quadruple';
}

const sonoffBasic = toTopic('cmnd/test-sonoff-basic/POWER');

ofTopic<ButtonTopic>('zigbee2mqtt/Kellerabgang_Button')
    .pipe(
        tap(val => myLogger.debug(`received on topic ${val.topic}: ${JSON.stringify(val.message)}`)),
        map(val => val.message.click)
    )
    .subscribe(val => {
        myLogger.info(`${val}`);
        if (val === 'single') {
            sonoffBasic.next('TOGGLE');
        } else if (val === 'double') {
            sonoffBasic.next('ON');
        } else if (val === 'triple') {
            sonoffBasic.next('OFF');
        }
    });
