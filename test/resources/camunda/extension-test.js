'use strict';

const { expect } = require('chai');

const EventEmitter2 = require('eventemitter2');
const factory = require('../../helpers/factory');
const nock = require('nock');
const testHelpers = require('../../helpers/testHelpers');
const {EventEmitter} = require('events');
const camundaExtensions = require('../../../resources/camunda');
const {Engine} = require('bpmn-engine');
const request = require('request');

const {getDefinition, debug} = testHelpers;

describe('Camunda extension', () => {
  describe('behavior', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="testIoSpec" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <dataObjectReference id="inputRef" dataObjectRef="input" />
        <dataObjectReference id="staticRef" dataObjectRef="static" />
        <dataObjectReference id="surnameRef" dataObjectRef="surname" />
        <dataObjectReference id="givenNameRef" dataObjectRef="givenName" />
        <dataObject id="input" />
        <dataObject id="static" />
        <dataObject id="surname" />
        <dataObject id="givenName" />
        <startEvent id="theStart" />
        <userTask id="task-form-only">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="field_surname" label="\${environment.variables.surnameLabel}" defaultValue="\${variables.surname}" />
            </camunda:formData>
          </extensionElements>
        </userTask>
        <userTask id="task-io-combo">
          <extensionElements>
            <camunda:InputOutput>
              <camunda:inputParameter name="input">\${environment.variables.input}</camunda:inputParameter>
              <camunda:outputParameter name="result">\${signal}</camunda:outputParameter>
            </camunda:InputOutput>
          </extensionElements>
          <ioSpecification id="inputSpec1">
            <dataInput id="input_1" name="input" />
            <dataInput id="staticField" name="static" />
            <dataOutput id="signalOutput" name="signal" />
            <inputSet id="inputSet_1">
              <dataInputRefs>input_1</dataInputRefs>
              <dataInputRefs>staticField</dataInputRefs>
            </inputSet>
          </ioSpecification>
          <dataInputAssociation id="associatedInput" sourceRef="input_1" targetRef="inputRef" />
          <dataInputAssociation id="associatedStatic" sourceRef="staticField" targetRef="staticRef" />
          <dataOutputAssociation id="associatedOutput" sourceRef="signalOutput" targetRef="surnameRef" />
        </userTask>
        <userTask id="task-io-form-combo">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="field_age" label="\${surname} age" defaultValue="\${environment.variables.input}" />
              <camunda:formField id="field_givename" label="Before \${surname}" defaultValue="\${environment.variables.givenName}" />
            </camunda:formData>
          </extensionElements>
          <ioSpecification id="inputSpec2">
            <dataInput id="input_2" name="age" />
            <dataInput id="input_3" name="surname" />
            <dataOutput id="givenNameField" name="field_givename" />
            <dataOutput id="ageField" name="field_age" />
            <outputSet id="outputSet_2">
              <dataOutputRefs>givenNameField</dataOutputRefs>
              <dataOutputRefs>ageField</dataOutputRefs>
            </outputSet>
          </ioSpecification>
          <dataInputAssociation id="associatedInput_2" sourceRef="input_2" targetRef="inputRef" />
          <dataInputAssociation id="associatedInput_3" sourceRef="input_3" targetRef="surnameRef" />
          <dataOutputAssociation id="associatedOutput_2" sourceRef="givenNameField" targetRef="givenNameRef" />
          <dataOutputAssociation id="associatedOutput_3" sourceRef="ageField" targetRef="inputRef" />
        </userTask>
        <endEvent id="theEnd" />
        <sequenceFlow id="flow1" sourceRef="theStart" targetRef="task-form-only" />
        <sequenceFlow id="flow2" sourceRef="task-form" targetRef="task-io-spec" />
        <sequenceFlow id="flow3" sourceRef="task-io-combo" targetRef="task-io-combo-form" />
        <sequenceFlow id="flow4" sourceRef="task-io-combo-form" targetRef="theEnd" />
      </process>
    </definitions>`;

    let definition;
    let listener;
    beforeEach(async () => {
      listener = new EventEmitter2({
        wildcard: true
      });
      definition = await getDefinition(source, camundaExtensions, listener);
      definition.environment.assignVariables({input: 1, static: 2, surnameLabel: 'Surname?' });
    });

    describe('no specified io', () => {
      it('returns empty input and output', (done) => {
        const activity = definition.getActivityById('theStart');

        activity.on('enter', () => {
          expect(activity.behaviour.io).to.be.undefined;
        });
        activity.on('end', () => {
          expect(activity.behaviour.io).to.be.undefined;
          done();
        });

        activity.activate();
        activity.run();
      });
    });

    describe('with form only', () => {
      it('saves form data to environment', (done) => {
        const activity = definition.getActivityById('task-form-only');

        activity.on('wait', (activityApi) => {
          const form = activity.behaviour.io.getForm(activityApi.content);
          expect(form).to.be.ok;
          expect(form.getFields()).to.have.length(1);

          const field = form.getField('field_surname');
          expect(field.label).to.equal('Surname?');
          expect(field.defaultValue).to.be.undefined;

          form.setFieldValue('field_surname', 'Edman');

          activityApi.signal();
        });

        activity.on('end', (activityApi) => {
          expect(activity.behaviour.io.getOutput(activityApi)).to.eql({
            field_surname: 'Edman'
          });

          activity.behaviour.io.save();
          expect(definition.environment.variables.field_surname).to.eql('Edman');

          done();
        });

        activity.activate();
        activity.run();
      });
    });

    describe('combined io', () => {
      it('returns expected input and output', (done) => {

        const activity = definition.getActivityById('task-io-combo');

        activity.on('wait', () => {
          expect(activity.behaviour.io.getInput()).to.eql({
            input: 1,
            // DataInputs are only for reference
            //            static: 2
          });

          activity.getApi().signal({
            signal: 'a'
          });
        });

        activity.on('end', (message) => {
          // ===> THIS IS NEVERCALLED... inside the activity
          activity.behaviour.io.setResult(message.content.output);
          expect(activity.behaviour.io.getOutput()).to.eql({
            result: 'a'
          });

          activity.behaviour.io.save();
          expect(definition.environment.variables.result).to.eql('a');

          done();
        });

        activity.activate();
        activity.run();
      });


      /*
      it.skip('with form only set form properties', (done) => {

        definition.environment.assignVariables({input: 1, static: 2, surname: 'Edman' });

        const activity = definition.getActivityById('task-io-form-combo');

        activity.on('wait', () => {
//          const api = activityApi.getApi(activityExecution);
          const ioApi = activity.behaviour.io;
          expect(ioApi.getInput()).to.equal({
            age: 1,
            surname: 'Edman',
            field_age: 1,
            field_givename: undefined,
          });

          const formApi = ioApi.getForm();
          const field1 = formApi.getField('field_age');
          expect(field1.defaultValue).to.equal(1);
          expect(field1.label).to.equal('Edman age');

          const field2 = formApi.getField('field_givename');
          expect(field2.defaultValue).to.be.undefined();
          expect(field2.label).to.equal('Before Edman');

          formApi.setFieldValue('field_age', 2);
          formApi.setFieldValue('field_givename', 'P');

          console.log('api signalled');
          activity.getApi().signal();
          console.log('api signalled');
        });

        activity.on('end', () => {
          const api = activity.behaviour.io;

          expect(api.getOutput()).to.equal({
            givenNameField: 'P',
            ageField: 2
          });

          api.save();
          // missing environment.getOutput
          expect(definition.environment.getOutput()).to.equal({
            input: 2,
            givenName: 'P'
          });

          done();
        });

        activity.activate();
        activity.run();
      });
    */
    });

    describe('getState()', () => {
      it('returns state per io', (done) => {

        const activity = definition.getActivityById('task-io-combo');

        let state;
        activity.on('wait', () => {
          const api = activity.behaviour.io;
          state = api.getState();
          activity.stop();

          /*
         ioSpecification non supported!
          expect(state.io, 'io').to.be.ok;
          expect(state.io.ioSpecification, 'io.ioSpecification').to.be.ok;
          expect(state.io.ioSpecification).to.eql({
            input: {
              input: 1,
              static: 2
            }
          });
        */
          expect(state).to.be.ok;
          expect(state).to.eql({ input: { input: 1 } });
          done();
        });
        activity.activate();
        activity.run();
      });
    });

    describe('resume()', () => {
      it('resumes state per io', (done) => {

        const activity = definition.getActivityById('task-io-combo');

        activity.on('wait', async () => {
          const activityState = activity.getState();
          activity.stop();

          debug('******* STOPPED!');
          const definitionState = definition.getState();

          definition.environment.assignVariables({ input: 'a' });

          const resumedDefinition = await testHelpers.getDefinition(
            source,
            camundaExtensions,
            listener
          );

          const resumedActivity = resumedDefinition.getActivityById('task-io-combo');
          expect(resumedActivity.isStart).to.be.true;
          resumedActivity.on('activity.wait', () => {
            expect(resumedActivity.behaviour.io).to.be.ok;
            const inputs = resumedActivity.behaviour.io.getInput();
            expect(inputs).to.eql({
              input: 1
            });

            done();
          });

          resumedDefinition.recover(definitionState);
          const resumedActivityApi = resumedActivity.recover(activityState);

          expect(resumedActivityApi.isStart).to.be.true;
          resumedActivityApi.resume();
        });

        activity.activate();
        activity.run();
      });
    });

  });

  describe('loop', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="testIoSpec" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <dataObjectReference id="inputRef" dataObjectRef="input" />
        <dataObjectReference id="staticRef" dataObjectRef="static" />
        <dataObjectReference id="ageRef" dataObjectRef="age" />
        <dataObjectReference id="givenNameRef" dataObjectRef="givenName" />
        <dataObject id="input" />
        <dataObject id="static" />
        <dataObject id="age" />
        <dataObject id="givenName" />
        <userTask id="task-io-loop">
          <multiInstanceLoopCharacteristics isSequential="false" camunda:collection="\${environment.variables.list}">
            <completionCondition xsi:type="tFormalExpression">\${services.condition(index)}</completionCondition>
            <loopCardinality xsi:type="tFormalExpression">3</loopCardinality>
          </multiInstanceLoopCharacteristics>
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="field_item" label="\${content.item.item}" />
              <camunda:formField id="field_age" label="\${environment.variables.surname} age" defaultValue="\${content.index}" />
              <camunda:formField id="field_givename" label="Before \${environment.variables.surname}" defaultValue="\${givenName}" />
            </camunda:formData>
          </extensionElements>
          <ioSpecification id="inputSpec2">
            <dataInput id="input_item" name="item" />
            <dataInput id="input_index" name="index" />
            <dataInput id="input_age" name="age" />
            <dataOutput id="givenNameField" name="field_givename" />
            <dataOutput id="ageField" name="field_age" />
            <outputSet id="outputSet_2">
              <dataOutputRefs>givenNameField</dataOutputRefs>
              <dataOutputRefs>ageField</dataOutputRefs>
            </outputSet>
          </ioSpecification>
          <dataInputAssociation id="associatedInput_3" sourceRef="input_age" targetRef="ageRef" />
          <dataOutputAssociation id="associatedOutput_2" sourceRef="givenNameField" targetRef="givenNameRef" />
          <dataOutputAssociation id="associatedOutput_3" sourceRef="ageField" targetRef="inputRef" />
        </userTask>
      </process>
    </definitions>`;

    let definition;
    let listener;
    beforeEach(async () => {
      listener = new EventEmitter({ wildcard: true });
      definition = await testHelpers.getDefinition(source, camundaExtensions, listener);
    });

    it('io is loop aware', (done) => {
      definition.environment.assignVariables({
        input: 1,
        static: 2,
        list: [ { item: 'a'}, { item: 'b' }]
      });

      const activity = definition.getActivityById('task-io-loop');
      activity.on('wait', ( activityApi ) => {
        expect(activity.behaviour.loopCharacteristics).to.be.ok;
        expect(activityApi.content.isMultiInstance).to.be.true;
        expect(activityApi.content.isSequential).to.be.false;
        expect(activityApi.content.index).to.not.be.null;
        activityApi.signal();
      });

      activity.on('end', () => {
        done();
      });

      activity.activate();
      activity.run();
    });

    it('resolves input per iteration', (done) => {
      const list = [{
        item: 'a'
      }, {
        item: 'b'
      }, {
        item: 'c'
      }, {
        item: 'd'
      }];
      definition.environment.assignVariables({
        age: 1,
        surname: 'von Rosen',
        list: list
      });

      const activity = definition.getActivityById('task-io-loop');
      activity.on('wait', (activityApi) => {
        const form = activity.behaviour.io.getForm(activityApi);

        const input = form.getInput();
        expect(input).to.include({
          field_age: activityApi.content.index
        });
        activityApi.signal();
      });

      activity.on('end', () => {
        done();
      });

      activity.activate();
      activity.run();
    });

    it('resolves form per iteration', (done) => {
      const list = [{
        item: 'a'
      }, {
        item: 'b'
      }, {
        item: 'c'
      }, {
        item: 'd'
      }];

      definition.environment.assignVariables({
        age: 1,
        surname: 'von Rosen',
        list: list
      });

      const activity = definition.getActivityById('task-io-loop');

      activity.on('wait', (activityApi) => {

        const form = activity.behaviour.io.getForm(activityApi);
        const {getField} = form;

        expect(getField('field_item').label).to.equal(list[activityApi.content.index].item);
        expect(getField('field_item').defaultValue).to.be.undefined;

        expect(getField('field_age').label).to.equal('von Rosen age');
        expect(getField('field_age').defaultValue).to.equal(activityApi.content.index);

        expect(getField('field_givename').label).to.equal('Before von Rosen');
        expect(getField('field_givename').defaultValue).to.be.undefined;

        activityApi.signal();
      });

      activity.on('end', () => {
        done();
      });

      activity.activate();
      activity.run();
    });

    it('ioSpecification saves result on iteration end', (done) => {
      const list = [{
        item: 'a'
      }, {
        item: 'b'
      }, {
        item: 'c'
      }, {
        item: 'd'
      }];

      definition.environment.assignVariables({
        age: 1,
        surname: 'von Rosen',
        list: list
      });

      const activity = definition.getActivityById('task-io-loop');
      activity.on('wait', (activityApi) => {
        const form = activity.behaviour.io.getForm(activityApi);

        const {index} = activityApi.content;

        form.setFieldValue('field_item', `item#${index}`);
        form.setFieldValue('field_age', index);
        form.setFieldValue('field_givename', `given#${index}`);

        activityApi.signal(form.getOutput());
      });

      activity.on('end', (activityApi) => {
        const output = activityApi.content.output;
        output.forEach(value => {
          expect(value.field_item).to.be.equal('item#' + value.field_age);
          expect(value.field_givename).to.be.equal('given#' + value.field_age);
        });
      });

      activity.on('leave', (activityApi) => {

        const form = activity.behaviour.io.getForm(activityApi);
        const output = activityApi.content.output;
        const aggregate = {};
        output.forEach((outputItem) => {
          Object.keys(outputItem).forEach(key => {
            if (!aggregate[key]) aggregate[key] = [];
            aggregate[key].push(outputItem[key]);
          });
        });
        form.getFields().forEach(field => {
          if (aggregate[field.id]) field.set(aggregate[field.id]);
        });
        activity.behaviour.io.save();

        const formOutput = form.getOutput();
        const expected = {
          'field_item': ['item#0', 'item#1', 'item#2'],
          'field_age': [0, 1, 2],
          'field_givename': ['given#0', 'given#1', 'given#2' ]
        };
        expect(formOutput).to.deep.equal(expected);
        const variables = definition.environment.variables;
        expect(variables).to.deep.include(formOutput);

        done();
      });

      activity.activate();
      activity.run();
    });

  });

  describe('issue-19 - on error', () => {
    let services;
    const source = factory.resource('issue-19-2.bpmn');
    before((doneBefore) => {
      const statusCodeOk = (statusCode) => {
        debug('************************* STATUSOK');
        return statusCode === 200;
      };
      const extractErrorCode = (errorMessage) => {
        debug('************************* EXTRACT');
        if (!errorMessage) return;
        const codeMatch = errorMessage.match(/^([A-Z_]+):.+/);
        if (codeMatch) return codeMatch[1];
      };

      services = {
        get: (...args) => {
          debug('> service get args: %o', args);
          return request.get(...args);
        },
        statusCodeOk,
        extractErrorCode
      };

      debug('************************* CODE19');
      doneBefore();
    });

    it('completes when returning to request after resume', async (done) => {
      let state;
      const listener = new EventEmitter2({ wildcard: true });

      listener.prependAny((eventName, eventValue) => {
        debug(' *************************** listener received: %o - %o', eventName, eventValue);
        /*
        if (eventApi.name === 'Errored') {
          fail('Error: ' + eventApi.name);
        }
        state = engine.getState();
        */
      });
      listener.on('process.start', (...args) => {
        debug(' *************************** listener received: %o - %o', args);
        state = engine.getState();
      });

      listener.once('wait-waitForSignalTask', () => {
        state = engine.getState();
        engine.stop();
      });

      const engine = Engine({
        name: 'test-completes',
        source,
        extensions: { camunda: camundaExtensions.extension },
        moddleOptions: { camunda: camundaExtensions.moddleOptions }
      });

      engine.once('end', () => {
        const listener2 = new EventEmitter();
        listener2.once('wait-waitForSignalTask', (activityApi) => {
          activityApi.signal();
        });

        nock('http://example.com')
          .get('/api')
          .reply(200, {
            status: 'OK'
          });

        const engine2 = Engine.resume(state, {
          extensions: { camunda: camundaExtensions.extension },
          moddleOptions: { camunda: camundaExtensions.moddleOptions },
          listener: listener2
        });
        engine2.once('end', (execution) => {
          expect(execution.getOutput()).to.eql({
            statusCode: 200,
            body: {
              status: 'OK'
            },
            retry: true
          });
          done();
        });
      });

      nock('http://example.com')
        .get('/api')
        .reply(502);

      const execution = await engine.execute({
        listener,
        services,
        variables: {
          apiUrl: 'http://example.com/api',
          timeout: 'PT0.1S'
        }
      });
      debug(execution);
    });

    it('caught error is saved to variables', (done) => {
      let state;
      const engine = Engine({
        source,
        extensions: { camunda: camundaExtensions.extension },
        moddleOptions: { camunda: camundaExtensions.moddleOptions },
      });
      const listener = new EventEmitter();

      listener.on('start', () => {
        state = engine.getState();
      });

      listener.once('wait-waitForSignalTask', () => {
        state = engine.getState();
        engine.stop();
      });

      engine.once('end', () => {
        const listener2 = new EventEmitter();
        listener2.once('wait-waitForSignalTask', (task) => {
          task.signal();
        });

        nock('http://example.com')
          .get('/api')
          .reply(200, {
            status: 'OK'
          });

        const engine2 = Engine.resume(state, {
          extensions: { camunda: camundaExtensions.extension },
          moddleOptions: { camunda: camundaExtensions.moddleOptions },
          listener: listener2
        });
        engine2.once('end', (execution2, definitionExecution) => {
          expect(execution2.getOutput()).to.eql({
            retry: true,
            errorCode: 'REQ_FAIL',
            requestErrorMessage: 'REQ_FAIL: Error message',
            statusCode: 200,
            body: {
              status: 'OK'
            }
          });
          expect(definitionExecution.getChildState('terminateEvent').taken).to.be.undefined;
          expect(definitionExecution.getChildState('end').taken).to.be.true;
          done();
        });
      });

      nock('http://example.com')
        .get('/api')
        .replyWithError(new Error('REQ_FAIL: Error message'));

      engine.execute({
        listener,
        variables: {
          apiUrl: 'http://example.com/api',
          timeout: 'PT0.1S'
        },
        services: services
      });
    });

    it('takes decision based on error', (done) => {
      let state;
      const engine = Engine({
        source,
        extensions: { camunda: camundaExtensions.extension },
        moddleOptions: { camunda: camundaExtensions.moddleOptions },
      });
      const listener = new EventEmitter();

      listener.on('start', () => {
        state = engine.getState();
      });

      listener.once('wait-waitForSignalTask', () => {
        state = engine.getState();
        engine.stop();
      });

      engine.once('end', () => {
        const listener2 = new EventEmitter();
        listener2.once('wait-waitForSignalTask', (activityApi) => {
          activityApi.signal();
        });

        nock('http://example.com')
          .get('/api')
          .replyWithError(new Error('RETRY_FAIL: Error message'));

        const engine2 = Engine.resume(state, {
          extensions: { camunda: camundaExtensions.extension },
          moddleOptions: { camunda: camundaExtensions.moddleOptions },
          listener: listener2
        });
        engine2.once('end', (execution, definitionExecution) => {
          expect(definitionExecution.getOutput()).to.eql({
            retry: true,
            errorCode: 'RETRY_FAIL',
            requestErrorMessage: 'RETRY_FAIL: Error message'
          });
          expect(definitionExecution.getChildState('terminateEvent').taken).to.be.true;
          expect(definitionExecution.getChildState('end').taken).to.be.undefined;
          done();
        });
      });

      nock('http://example.com')
        .get('/api')
        .replyWithError(new Error('REQ_FAIL: Error message'));

      engine.execute({
        listener,
        variables: {
          apiUrl: 'http://example.com/api',
          timeout: 'PT0.1S'
        },
        services
      });
    });
  });

  describe('issue 23', () => {
    it('looped exclusiveGateway with io should trigger end event', (done) => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="issue-23" isExecutable="true">
          <startEvent id="start" />
          <task id="task1" />
          <task id="task2">
            <extensionElements>
              <camunda:InputOutput>
                <camunda:outputParameter name="tookDecision">\${variables.decision}</camunda:outputParameter>
              </camunda:InputOutput>
            </extensionElements>
          </task>
          <exclusiveGateway id="decision" default="flow4">
            <extensionElements>
              <camunda:InputOutput>
                <camunda:outputParameter name="decision">\${true}</camunda:outputParameter>
              </camunda:InputOutput>
            </extensionElements>
          </exclusiveGateway>
          <endEvent id="end" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="task1" />
          <sequenceFlow id="flow2" sourceRef="task1" targetRef="task2" />
          <sequenceFlow id="flow3" sourceRef="task2" targetRef="decision" />
          <sequenceFlow id="flow4" sourceRef="decision" targetRef="task1" />
          <sequenceFlow id="flow5" sourceRef="decision" targetRef="end">
            <conditionExpression xsi:type="tFormalExpression">\${variables.tookDecision}</conditionExpression>
          </sequenceFlow>
        </process>
      </definitions>`;

      const engine = new Engine({
        source,
        extensions: { camunda: camundaExtensions.extension },
        moddleOptions: { camunda: camundaExtensions.moddleOptions },
      });
      engine.once('end', (execution, definitionExecution) => {
        expect(definitionExecution.getChildState('end').taken).to.be.true;
        done();
      });

      const listener = new EventEmitter();
      let taskCount = 0;
      listener.on('start-task1', (a) => {
        taskCount++;
        if (taskCount > 2) {
          throw new Error(`Too many <${a.id}> starts`);
        }
      });

      engine.execute({
        listener
      });
    });
  });

  describe('activity io', () => {
    let definition;
    before(async () => {
      const source = factory.resource('service-task-io-types.bpmn').toString();
      definition = await getDefinition(source, camundaExtensions);
    });

    it('getInput() without defined io returns undefined', (done) => {
      const task = definition.getChildActivityById('StartEvent_1');
      expect(task).to.have.property('io');
      expect(task.io.activate(task).getInput()).to.be.undefined;
      done();
    });

    it('getOutput() without defined io returns nothing', (done) => {
      const task = definition.getChildActivityById('StartEvent_1');
      expect(task.io.activate(task).getOutput()).to.be.undefined;
      done();
    });

    it('setOutputValue() assigns result', (done) => {
      const task = definition.getChildActivityById('StartEvent_1');
      const activatedIo = task.io.activate(task);

      activatedIo.setOutputValue('name', 'me');
      expect(activatedIo.getOutput()).to.eql({name: 'me'});
      done();
    });

    it('setOutputValue() assigns to other result', (done) => {
      const task = definition.getChildActivityById('StartEvent_1');
      const activatedIo = task.io.activate(task);
      activatedIo.setResult({
        input: 1
      });
      activatedIo.setOutputValue('name', 'me');
      expect(activatedIo.getOutput()).to.eql({
        input: 1,
        name: 'me'
      });

      done();
    });
  });

});
