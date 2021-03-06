import { BehaviorSubject, Notification, Observable, of } from 'rxjs';
import { NotificationKind } from 'rxjs/internal/Notification';
import {
  DoTransferableWork,
  DoTransferableWorkUnit,
  DoWork,
  DoWorkUnit,
  WorkerMessageNotification,
} from './observable-worker.types';
import { runWorker, workerIsTransferableType, workerIsUnitType } from './run-worker';

describe('workerIsTransferableType', () => {
  it('should identify a worker as being able to map transferables', () => {
    class TestWorkerTransferable implements DoTransferableWork<number, number> {
      public selectTransferables(output: number): Transferable[] {
        return [];
      }

      public work(input$: Observable<number>): Observable<number> {
        return undefined;
      }
    }

    class TestWorkerNotTransferable implements DoWork<number, number> {
      public work(input$: Observable<number>): Observable<number> {
        return undefined;
      }
    }

    expect(workerIsTransferableType(new TestWorkerTransferable())).toBe(true);
    expect(workerIsTransferableType(new TestWorkerNotTransferable())).toBe(false);
  });
});

describe('workerIsUnitType', () => {
  it('should identify a worker as being able to do work units', () => {
    class TestWorkerUnit implements DoWorkUnit<number, number> {
      public workUnit(input: number): Observable<number> {
        return undefined;
      }
    }

    class TestWorkerNotUnit implements DoWork<number, number> {
      public work(input$: Observable<number>): Observable<number> {
        return undefined;
      }
    }

    expect(workerIsUnitType(new TestWorkerUnit())).toBe(true);
    expect(workerIsUnitType(new TestWorkerNotUnit())).toBe(false);
  });
});

describe('runWorker', () => {
  it('should read messages from self.message event emitter and process work and send results back to postmessage', () => {
    const postMessageSpy = spyOn(window, 'postMessage');

    class TestWorkerUnit implements DoWorkUnit<number, number> {
      public workUnit(input: number): Observable<number> {
        return of(input * 2);
      }
    }

    const sub = runWorker(TestWorkerUnit);

    const event: WorkerMessageNotification<number> = new MessageEvent('message', {
      data: new Notification(NotificationKind.NEXT, 11),
    });

    self.dispatchEvent(event);

    expect(postMessageSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({
        kind: NotificationKind.NEXT,
        value: 22,
      }),
    );

    expect(postMessageSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({
        kind: NotificationKind.COMPLETE,
      }),
    );

    sub.unsubscribe();
  });

  it('should pass outbound transferables to the postMessage call', () => {
    const postMessageSpy = spyOn(window, 'postMessage');

    class TestWorkerUnitTransferable implements DoTransferableWorkUnit<Int8Array, Int8Array> {
      public workUnit(input: Int8Array): Observable<Int8Array> {
        for (let i = 0; i < input.length; i++) {
          input[i] *= 3;
        }

        return of(input);
      }

      public selectTransferables(output: Int8Array): Transferable[] {
        return [output.buffer];
      }
    }

    const sub = runWorker(TestWorkerUnitTransferable);

    const payload = new Int8Array(3);
    payload[0] = 1;
    payload[1] = 2;
    payload[2] = 3;

    const expected = new Int8Array(3);
    expected[0] = 3;
    expected[1] = 6;
    expected[2] = 9;

    const event: WorkerMessageNotification<number> = new MessageEvent('message', {
      data: new Notification(NotificationKind.NEXT, payload),
    });

    self.dispatchEvent(event);

    expect(postMessageSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({
        kind: NotificationKind.NEXT,
        value: payload,
      }),
      [expected.buffer],
    );

    expect(postMessageSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({
        kind: NotificationKind.COMPLETE,
      }),
    );

    sub.unsubscribe();
  });

  it('should not complete the notification stream if the worker does not complete', () => {
    const postMessageSpy = spyOn(window, 'postMessage');
    postMessageSpy.calls.reset();

    class TestWorker implements DoWork<number, number> {
      public work(input$: Observable<number>): Observable<number> {
        return new BehaviorSubject(1);
      }
    }

    const sub = runWorker(TestWorker);

    const event: WorkerMessageNotification<number> = new MessageEvent('message', {
      data: new Notification(NotificationKind.NEXT, 0),
    });

    self.dispatchEvent(event);

    expect(postMessageSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({
        kind: NotificationKind.NEXT,
        value: 1,
      }),
    );

    expect(postMessageSpy).not.toHaveBeenCalledWith(
      jasmine.objectContaining({
        kind: NotificationKind.COMPLETE,
      }),
    );

    sub.unsubscribe();
  });
});
