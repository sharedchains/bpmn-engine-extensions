'use strict';

const factory = require('../../helpers/factory');
const {getDefinition,getEngine,debug} = require('../../helpers/testHelpers');
const EventEmitter2 = require('eventemitter2');
const { uniqueID } = require('mocha/lib/utils');

describe('Camunda Forms', () => {
  describe('behaviour', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start">
          <extensionElements>
            <camunda:formData />
          </extensionElements>
        </startEvent>
        <userTask id="task">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="input" label="\${environment.variables.label}" defaultValue="\${variables.input}" />
            </camunda:formData>
            <camunda:InputOutput>
              <camunda:inputParameter name="input">\${environment.variables.input}</camunda:inputParameter>
            </camunda:InputOutput>
          </extensionElements>
        </userTask>
        <userTask id="task2">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="input" label="\${environment.variables.label}" />
            </camunda:formData>
          </extensionElements>
        </userTask>
      </process>
    </definitions>`;

    let definition;
    beforeEach(async () => {
      definition = await getDefinition(source);
    });

    it('has access to variables and activity input when assigning label and default value', (done) => {
      definition.environment.assignVariables({ input: 1, label: 'field label' });

      const activity = definition.getActivityById('task');

      activity.on('enter', () => {
        const form = activity.behaviour.io.getForm();
        const field = form.getField('input');

        expect(field.label, 'label').to.equal('field label');
        expect(field.get(), 'value').to.equal(1);
        done();
      });

      activity.activate();
      activity.run();
    });

    it('assigned field value is returned in form output', (done) => {
      definition.environment.assignVariables({ input: -11, label: 'field label' });

      const activity = definition.getActivityById('task');

      activity.on('activity.wait', (activityApi) => {
        const fields = activity.behaviour.io.getForm().getFields();
        fields.forEach(({set}, idx) => set(idx * 10));
        activityApi.signal();
      });

      activity.on('end', () => {
        expect(activity.behaviour.io.getForm().getOutput()).to.eql({
          input: 0
        });
        done();
      });

      activity.activate();
      activity.run();
    });

    it('without fields ignores form', (done) => {
      const activity = definition.getActivityById('start');
      expect(activity.behaviour.io).to.equal(undefined);
      activity.on('enter', () => {
        expect(activity.behaviour.io).to.equal(undefined);
        done();
      });
      activity.activate();
      activity.run();
    });

    it('setFieldValue() of unknown field is ignored', (done) => {
      definition.environment.assignVariables({ input: 1});

      const activity = definition.getActivityById('task');

      activity.on('enter', () => {
        const activeForm = activity.behaviour.io.getForm();
        activeForm.setFieldValue('arb', 2);
        expect(activeForm.getOutput()).to.eql({input: 1});
        done();
      });

      activity.activate();
      activity.run();
    });

    it('reset() resets fields to default value', (done) => {
      definition.environment.assignVariables({ input: 1});

      const activity = definition.getActivityById('task');

      activity.on('enter', () => {
        const activeForm = activity.behaviour.io.getForm();
        activeForm.setFieldValue('input', 2);
      });

      activity.on('wait', (activityApi) => {
        activity.behaviour.io.getForm().reset();
        activityApi.signal();
      });

      activity.on('end', () => {
        expect(activity.behaviour.io.getForm().getOutput()).to.eql({
          input: 1
        });
        done();
      });

      activity.activate();
      activity.run();
    });

  });

  describe('with default value', () => {
    it('returns value from expression', (done) => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="theProcess" isExecutable="true">
          <startEvent id="start">
            <extensionElements>
              <camunda:formData>
                <camunda:formField id="inputDate" label="Input date" type="date" defaultValue="\${environment.variables.now}" />
              </camunda:formData>
            </extensionElements>
            <outgoing>flow1</outgoing>
          </startEvent>
          <endEvent id="end" />
          <sequenceFlow id="flow1" sourceRef="start" targetRef="end" />
        </process>
      </definitions>`;

      const engine = getEngine(source);
      const now = new Date('2017-02-05');

      engine.broker.subscribe('event', 'activity.start', null, (event, message) => {
        if (message.content.id !== 'start') return;
        debug('> event: %o/%o', event, message.content.id);
        const task = engine.execution.getActivityById('start');
        const fields = task.behaviour.io.getForm().getFields();
        expect(fields[0]).to.have.property('defaultValue', now);
        done();
      }, { noAck: true, consumerTag: uniqueID(), durable: true});

      engine.execute({
        variables: {
          now
        }
      });
    });
  });

  describe('start form', () => {
    it('waits for start', (done) => {
      const engine = getEngine(factory.resource('forms.bpmn'));

        const now = new Date('2017-02-05');
        const tomorrow = new Date('2017-02-06');
        const dayAfterTomorrow = new Date('2017-02-07');
      engine.getDefinitions().then(definitions => {
        const definition = definitions[0];


        engine .broker.subscribe('event', 'activity.wait', null, (event, message) => {
          debug(message);
          const userTask = definition.getActivityById('userTask');
          debug(userTask.behaviour.io);
          debug(userTask);
          const fields = userTask.behaviour.io.getForm().getFields();

          expect(fields[0]).to.include({
            defaultValue: tomorrow
          });

          const reply = {};
          reply[fields[0].id] = dayAfterTomorrow;

          userTask.getApi().signal(reply);
          return context;
        });
          /*
          const fields = startTask.behaviour.io.getForm().getFields();

          expect(fields[0]).to.include({
            defaultValue: now
          });

          fields[0].set(tomorrow);
          debug('STEP 1');
        // NO WAIT, nothing to signal on StartEvent
        //activityApi.signal();
        });

      listener.once('wait-userTask', (activityApi) => {
        const fields = activityApi.form.getFields();

        expect(fields[0]).to.include({
          defaultValue: tomorrow
        });

        const reply = {};
        reply[fields[0].id] = dayAfterTomorrow;

        activityApi.signal(reply);
      });
        engine.once('end', (exe) => fnHandler((_exe) => {
          debug('QUI');
          let output = _exe.getOutput();
          expect(output).to.include({
            startDate: dayAfterTomorrow
          });
          done();
        }, exe)
        );
      */

      engine.execute({
          variables: {
            now
          }
        }).then(() => { debug('FINE'); done() });

    });
  });
  });

  describe('getState()', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="formfield1" label="FormField1" type="string" />
              <camunda:formField id="formfield2" label="FormField2" type="long" />
            </camunda:formData>
          </extensionElements>
        </startEvent>
        <userTask id="task">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="surname" label="Surname" type="string" />
              <camunda:formField id="givenName" label="Given name" type="string" />
            </camunda:formData>
          </extensionElements>
        </userTask>
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
        <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
      </process>
    </definitions>`;

    it('returns state of form fields', (done) => {
      const engine = getEngine(source);

      const listener = new EventEmitter2();
      listener.once('wait-start', (activityApi) => {
        engine.stop();
        const state = activityApi.getState().io.form;
        expect(state).to.have.property('fields');
        expect(state.fields).to.have.length(2);
        expect(Object.keys(state.fields[0])).to.have.same.members(['id', 'label', 'valueType']);
        expect(Object.keys(state.fields[1])).to.have.same.members(['id', 'label', 'valueType']);

        expect(state.fields[0]).to.eql({
          id: 'formfield1',
          label: 'FormField1',
          valueType: 'string'
        });
        done();
      });

      engine.execute({
        listener
      });
    });
  });

  describe('resume()', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="formfield1" label="FormField1" type="string" />
              <camunda:formField id="formfield2" type="long" />
            </camunda:formData>
          </extensionElements>
        </startEvent>
        <userTask id="task">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="surname" label="Surname" type="string" />
              <camunda:formField id="givenName" label="Given name" type="string" />
            </camunda:formData>
          </extensionElements>
        </userTask>
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
        <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
      </process>
    </definitions>`;

    it('resumes start event with assigned values', (done) => {
      const engine = getEngine(source);

      let listener = new EventEmitter2();
      listener.once('wait-start', (activityApi) => {
        expect(activityApi.form.setFieldValue('formfield1', 'stop')).to.equal(true);
        engine.stop();
      });

      engine.execute({
        listener
      });

      engine.on('end', () => {
        const state = engine.getState();
        listener = new EventEmitter2();
        listener.on('wait-start', ({form}) => {
          const field = form.getField('formfield1');
          expect(field.get()).to.equal('stop');
          done();
        });

        Engine.resume(state, {listener, extensions});
      });
    });

    it('resumes with assigned values', (done) => {
      const engine = getEngine(source);

      let listener = new EventEmitter2();
      listener.once('wait-start', (activityApi) => {
        expect(activityApi.form.setFieldValue('formfield1', 'stop2')).to.equal(true);
        engine.stop();
      });

      engine.execute({
        listener
      });

      engine.on('end', () => {
        const state = engine.getState();
        listener = new EventEmitter2();

        listener.on('wait-start', ({form, signal}) => {
          const field1 = form.getField('formfield1');
          const field2 = form.getField('formfield2');
          expect(field1.get()).to.equal('stop2');
          expect(field2.get()).to.equal(undefined);

          field2.set('resume');

          signal(form.getOutput());
        });

        listener.on('wait-task', ({signal}) => {
          signal();
        });

        Engine.resume(state, {listener, extensions}, done);
      });
    });

    it('resume fields ignores fields not in field set', (done) => {
      getDefinition(source).then((definition) => {
        const activity = definition.getChildActivityById('task');
        let state;
        activity.once('wait', (activityApi, executionContext) => {
          const api = activityApi.getApi(executionContext);
          api.form.setFieldValue('surname', 'Edman');
          state = api.getState();

          state.io.form.fields.splice(1, 1);
          state.io.form.fields.push({
            id: 'arb'
          });
          api.stop();

          activity.on('wait', (resumedActivityApi, resumedExecutionContext) => {
            const resumedApi = resumedActivityApi.getApi(resumedExecutionContext);

            expect(resumedApi.form.getFieldValue('arb')).to.equal(undefined);
            expect(resumedApi.form.getFieldValue('surname')).to.equal('Edman');

            done();
          });

          activity.activate(state).resume();
        });

        activity.activate().run();
      }).catch(done);
    });
  });
});
