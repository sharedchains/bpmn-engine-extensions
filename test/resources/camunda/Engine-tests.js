'use strict';

const { expect } = require('chai');
const { Engine } = require('bpmn-engine');
const { EventEmitter2 } = require('eventemitter2');

function dumpQueue(state) {
  const queues = state.definitions[0].execution.processes[0].broker.queues;
  queues.forEach(q => {
    const mess = q.messages;
    console.error(q.options);
    mess.forEach(m => {
      const {content: c} = m;
      console.error('%o: %o %o', q.name, c.id, c.state);
    });
  })
}

function saveOutputToEnv(activity) {
  activity.on('activity.end', (activityApi) => {
    const { content, owner } = activityApi;

    if (content.output) {
      activityApi.environment.output[owner.id] = content.output;
    }
  });
}

describe('BaseEngine', () => {
  it('waits on user task', () => {
    const source = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <startEvent id="start" camunda:formKey='startFormKey'/>
    <userTask id="task" camunda:formKey='taskFormKey'/>
    <endEvent id="end" />
    <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
    <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
  </process>
</definitions>`;
    return new Promise((res, rej) => {
      const engine = new Engine({
        source: source,
        extensions: { saveOutputToEnv },
        name: 'test-engine'
      });

      const listener = new EventEmitter2();
      listener.on('wait', (elementApi) => {
        elementApi.signal({
          taskId: elementApi.id
        });
      });

      engine.on('end', (executionApi) => {
        try {
          const output = executionApi.environment.output;
          expect(output).to.have.property('task');
          expect(output.task).to.deep.equal({ taskId: 'task' });
          res();
        } catch (ex) {
          rej(ex);
        }
      });
      engine.execute({ listener });
    });
  });
  it('keeps multiple user task output', () => {
    const source = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <startEvent id="start" form='pippo' />
    <userTask id="task1" />
    <userTask id="task2" />
    <userTask id="task3" />
    <endEvent id="end" />
    <sequenceFlow id="flow1" sourceRef="start" targetRef="task1" />
    <sequenceFlow id="flow2" sourceRef="task1" targetRef="task2" />
    <sequenceFlow id="flow3" sourceRef="task2" targetRef="task3" />
    <sequenceFlow id="flow4" sourceRef="task3" targetRef="end" />
  </process>
</definitions>`;
    const engine = new Engine({
      source: source,
      extensions: { saveOutputToEnv }
    });

    const listener = new EventEmitter2();
    listener.on('wait', (elementApi) => {
      const outputName = 'output-' + elementApi.id;
      const outputValue = 'value-' + elementApi.id;
      elementApi.signal({
        [outputName]: outputValue
      });
    });

    listener.on('activity.end', (elementApi, engineApi) => {
      if (elementApi.type === 'bpmn:UserTask') {
        const outputName = 'output-' + elementApi.id;
        const outputValue = 'value-' + elementApi.id;
        expect(elementApi.content.output).to.deep.equal({ [outputName]: outputValue});
        engineApi.environment.output[elementApi.id] = elementApi.content.output;
      }
    });

    return new Promise((res, rej) => {
      engine.execute({ listener }, (err) => {
        if (err) rej(err);
        try {
          expect(engine.environment.output).to.be.ok;
          expect(engine.environment.output).to.deep.equal({
            task1: { 'output-task1': 'value-task1' },
            task2: { 'output-task2': 'value-task2' },
            task3: { 'output-task3': 'value-task3' }
          });
          res();
        } catch (ex) {
          rej(ex);
        }
      });
    });
  });
});

describe('Error handling on save and resume', () => {
  const source = `
?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
>
  <process id="error-state" isExecutable="true">
    <startEvent id="StartEvent_1" name="Start">
      <outgoing>AfterStartSequenceFlow</outgoing>
    </startEvent>
    <sequenceFlow id="AfterStartSequenceFlow" sourceRef="StartEvent_1" targetRef="makeRequestService" />
    <serviceTask id="makeRequestService" name="Make request" implementation="\${environment.services.makeRequestService}">
      <incoming>AfterStartSequenceFlow</incoming>
      <incoming>APIreadySequenceFlow</incoming>
      <outgoing>gotResponse</outgoing>
    </serviceTask>
    <endEvent id="end" name="End">
      <incoming>toEnd-flow</incoming>
    </endEvent>
    <sequenceFlow id="gotResponse" sourceRef="makeRequestService" targetRef="joinGateway" />
    <sequenceFlow id="checkErrorOrResponseFlow" name="" sourceRef="joinGateway" targetRef="statusGateway" />
    <boundaryEvent id="requestErrorEvent" name="Errored" attachedToRef="makeRequestService">
      <outgoing>errorFlow</outgoing>
      <errorEventDefinition errorRef="ErrorOnRequest" />
    </boundaryEvent>
    <sequenceFlow id="errorFlow" sourceRef="requestErrorEvent" targetRef="joinGateway" />
    <sequenceFlow id="APIreadySequenceFlow" sourceRef="waitForSignalTask" targetRef="makeRequestService" />
    <sequenceFlow id="toTerminateFlow" name="Yep!" sourceRef="retryGateway" targetRef="terminateEvent">
      <conditionExpression xsi:type="tFormalExpression">\${environment.variables.retry}</conditionExpression>
    </sequenceFlow>
    <endEvent id="terminateEvent" name="Terminate">
      <incoming>toTerminateFlow</incoming>
      <terminateEventDefinition />
    </endEvent>
    <exclusiveGateway id="statusGateway" name="Success?" default="toRetryGW-flow">
      <incoming>checkErrorOrResponseFlow</incoming>
      <outgoing>toEnd-flow</outgoing>
      <outgoing>toRetryGW-flow</outgoing>
    </exclusiveGateway>
    <sequenceFlow id="toEnd-flow" name="Yay!" sourceRef="statusGateway" targetRef="end">
      <conditionExpression xsi:type="tFormalExpression">\${environment.services.statusCodeOk(environment.variables)}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="toManualDefaultFlow" name="Try again" sourceRef="retryGateway" targetRef="waitForSignalTask" />
    <exclusiveGateway id="retryGateway" name="Retried?" default="toManualDefaultFlow">
      <incoming>toRetryGW-flow</incoming>
      <outgoing>toTerminateFlow</outgoing>
      <outgoing>toManualDefaultFlow</outgoing>
    </exclusiveGateway>
    <sequenceFlow id="toRetryGW-flow" name="No..." sourceRef="statusGateway" targetRef="retryGateway" />
    <exclusiveGateway id="joinGateway" name="" default="checkErrorOrResponseFlow">
      <incoming>gotResponse</incoming>
      <incoming>errorFlow</incoming>
      <outgoing>checkErrorOrResponseFlow</outgoing>
    </exclusiveGateway>
    <boundaryEvent id="signalTimeoutEvent" name="You have got 10 minutes" attachedToRef="waitForSignalTask">
      <timerEventDefinition id="TimerEventDefinition_0849v2v">
        <timeDuration xsi:type="tFormalExpression">\${environment.variables.timeout}</timeDuration>
      </timerEventDefinition>
    </boundaryEvent>
    <userTask id="waitForSignalTask" name="Signal when API ready">
      <incoming>toManualDefaultFlow</incoming>
      <outgoing>APIreadySequenceFlow</outgoing>
    </userTask>
    <sequenceFlow id="ApiNotReadyTimeoutFlow" sourceRef="signalTimeoutEvent" targetRef="NotReadyTerminateEvent" />
    <endEvent id="NotReadyTerminateEvent">
      <incoming>ApiNotReadyTimeoutFlow</incoming>
      <terminateEventDefinition id="TerminateEventDefinition_1dj4zf7" />
    </endEvent>
  </process>
  <error id="ErrorOnRequest" name="requestError" errorCode="code000" />
</definitions>
`;
  const services = {
    statusCodeOk: (vars) => {
      return (vars.responseCode && vars.responseCode === 200) || vars.exit;
    }
    , makeRequestService: (message, callback) => {
      setTimeout(() =>{
        callback({ name: 'requestError'
          , description: 'Error happened'
          , code: 'code000'
        }, null);
      }, 1);
    }
  };
  it('does not handle the error on resume', () => {
    return new Promise((res, rej) => {
      const engine = new Engine({
        name: 'test-engine'
        , services
        , source
        , variables: {
          exit: false
          , timeout: 'PT1S'
        }});

      let state;
      const listener = new EventEmitter2();
      listener.on('activity.catch', ({content}) => {
        // here we check error is raised correctly..
        const { error } = content;
        expect(error).to.be.ok;
        expect(error.code).to.eql('code000');
        expect(error.inner).to.be.ok;
        expect(error.inner).to.deep.be.equal({
          name: 'requestError',
          description: 'Error happened',
          code: 'code000'
        });
      });
      listener.on('activity.wait', (api) => {
        if (api.id === 'waitForSignalTask') {
          engine.getState().then(_state => {
            state = _state;
            dumpQueue(state);
            engine.stop();
          });
        }
      });
      engine.execute({ listener
      }, (err) => {
        if (err) rej(err);

        expect(state).to.be.ok;

        const listener2 = new EventEmitter2();
        listener2.on('activity.wait', (api) => {
          if (api.id === 'waitForSignalTask') {
            res();
          }
        });
        listener2.on('process.error', () => {
          // issue#31 on bpmn-elements
          rej('SHOULD NOT HAPPEN!');
        });
        const engine2 = new Engine({
          source, services
        }).recover(state);

        engine2.resume({ listener: listener2});
      });
    });
  });

  it('handles the error on resume', () => {
    return new Promise((res, rej) => {
      const engine = new Engine({
        name: 'test-engine'
        , services
        , source
        , variables: {
          exit: false
          , timeout: 'PT1S'
        }
      });

      let state;
      const listener = new EventEmitter2();
      listener.on('activity.catch', ({content}) => {
        // here we check error is raised correctly..
        const { error } = content;
        expect(error).to.be.ok;
        expect(error.code).to.eql('code000');
        expect(error.inner).to.be.ok;
        expect(error.inner).to.deep.be.equal({
          name: 'requestError',
          description: 'Error happened',
          code: 'code000'
        });
      });
      listener.on('activity.wait', (api) => {
        if (api.id === 'waitForSignalTask') {
          api.environment.assignVariables({ exit: true});
          engine.getState().then(_state => {
            state = _state;
            dumpQueue(state);
            engine.stop();
          });
        }
      });
      engine.execute({ listener
      }, (err) => {
        if (err) rej(err);

        const listener2 = new EventEmitter2();
        listener2.on('activity.wait', (api) => {
          if (api.id === 'waitForSignalTask') {
            api.signal({ exit: true });
          }
        });
        listener2.on('process.error', () => {
          rej('SHOULD NOT HAPPEN!');
        });
        listener2.on('process.end', (api) => {
          expect(api.environment.variables.exit).to.be.true;
          res();
        });
        const engine2 = new Engine({
          source, services
        }).recover(state);

        engine2.resume({ listener: listener2}, (err2) => {
          if (err2) rej(err2);
          // ok..
        });
      });
    });
  });
});
