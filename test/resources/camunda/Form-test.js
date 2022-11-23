'use strict';

const factory = require('../../helpers/factory');
const {getEngine, getProcess, initEngine, testEngine} = require('../../helpers/testHelpers');
const { saveOutputToEnv } = require('../../helpers/extensionsHacks');
const EventEmitter2 = require('eventemitter2');
const { uniqueID } = require('mocha/lib/utils');
const { assert, expect } = require('chai');

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
              <camunda:formField id="input" label="\${environment.variables.label}" defaultValue="\${environment.variables.input}" />
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
    beforeEach((done) => {
      initEngine(source).then(env => {
        definition = env.definition;
        done();
      });
    });

    it('has access to variables and activity input when assigning label and default value', (done) => {
      definition.environment.assignVariables({ input: 1, label: 'field label' });

      const activity = definition.getActivityById('task');

      activity.on('enter', () => {
        const form = activity.getForm();
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
        const fields = activity.getForm().getFields();
        fields.forEach(({set}, idx) => set(idx * 10));
        activityApi.signal();
      });

      activity.on('end', () => {
        expect(activity.getForm().getOutput()).to.eql({
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
        const activeForm = activity.getForm();
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
        const activeForm = activity.getForm();
        activeForm.setFieldValue('input', 2);
      });

      activity.on('wait', (activityApi) => {
        activity.getForm().reset();
        activityApi.signal();
      });

      activity.on('end', () => {
        expect(activity.getForm().getOutput()).to.eql({
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

      engine.broker.subscribe('event', 'activity.start', null, (_, message) => {
        if (message.content.id !== 'start') return;
        const task = engine.execution.getActivityById('start');
        const fields = task.getForm().getFields();
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
    it('waits for start', () => {
      const now = new Date('2017-02-05');
      const tomorrow = new Date('2017-02-06');
      const dayAfterTomorrow = new Date('2017-02-07');
      return testEngine({
        source: factory.resource('forms.bpmn'),
        extensions: { saveOutputToEnv },
        variables: {
          now
        }}, ({ engine, listener, res, rej }) => {

        listener.on('wait', ({ owner, id }) => {
          try {
            if (id === 'start') {
              const form = owner.getForm();
              const fields = form.getFields();

              expect(fields[0].id).to.equal('suggestedStartDate');
              expect(fields[0]).to.include({
                defaultValue: now
              });

              fields[0].set(tomorrow);

              owner.getApi().signal(form.getOutput());
              return;
            }
            if (id === 'userTask') {
              const form = owner.getForm();
              const fields = form.getFields();
              expect(fields[0]).to.include({
                defaultValue: tomorrow
              });

              fields[0].set(dayAfterTomorrow);
              owner.getApi().signal(form.getOutput());
              return;
            }
            rej('unexpected wait');
          } catch (ex) {
            rej(ex);
          }
        });
        /*
        engine.on('end', ({environment}) => {
          expect(environment.output).to.deep.equal({
            start: { suggestedStartDate: tomorrow },
            userTask: { startDate: dayAfterTomorrow }
          });

        });
        */
        engine.broker.subscribeTmp('run', '#', (_, message) => {
          if (message.content.error) {
            rej(message.content.error);
          }
        });
        engine.execute({ listener }, (err) => {
          if (err) rej(err);
          res();
        });
      });
    });
  });

  describe('getState()', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <bpmn:process id="theProcess" isExecutable="true">
        <bpmn:startEvent id="start" camunda:formKey="startForm">
          <bpmn:extensionElements>
            <camunda:formData>
              <camunda:formField id="formfield1" label="FormField1" type="string" />
              <camunda:formField id="formfield2" label="FormField2" type="long" />
            </camunda:formData>
          </bpmn:extensionElements>
          <bpmn:outgoing>flow1</bpmn:outgoing>
        </bpmn:startEvent>
        <bpmn:userTask id="task" camunda:formKey="userForm">
          <bpmn:extensionElements>
            <camunda:formData>
              <camunda:formField id="surname" label="Surname" type="string" />
              <camunda:formField id="givenName" label="Given name" type="string" />
            </camunda:formData>
          </bpmn:extensionElements>
          <bpmn:incoming>flow1</bpmn:incoming>
          <bpmn:outgoing>flow2</bpmn:outgoing>
        </bpmn:userTask>
        <bpmn:endEvent id="end">
          <bpmn:incoming>flow2</bpmn:incoming>
        </bpmn:endEvent>
        <bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
        <bpmn:sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
      </bpmn:process>
    </bpmn:definitions>`;

    it('returns state of form fields', () => {
      return testEngine(source, ({listener, engine, res, rej}) => {

        listener.once('wait', () => {
          engine.stop();
        });

        engine.execute({ listener }, (err) => {
          if (err) rej(err);
          engine.getState().then(state => {
            try {
              const start = getProcess(state, 'theProcess').getChildren('start');
              const formState = start.behaviour.state.form;

              expect(formState).to.have.property('fields');
              expect(formState.fields).to.have.length(2);
              expect(Object.keys(formState.fields[0])).to.have.same.members(['id', 'label', 'valueType']);
              expect(Object.keys(formState.fields[1])).to.have.same.members(['id', 'label', 'valueType']);

              expect(formState.fields[0]).to.deep.equal({
                id: 'formfield1',
                label: 'FormField1',
                valueType: 'string'
              });
              console.error('>>> FINE');
              res();
            } catch (ex) {
              rej(ex);
            }
          });
        });
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

    it('resumes start event with assigned values', () => {
      return testEngine(source, ({listener, engine, res, rej}) => {

        listener.on('wait', (activityApi) => {
          if (activityApi.id === 'start') {
            const form = activityApi.owner.getForm();
            form.setFieldValue('formfield1', 'stop');
            form.setFieldValue('formField2', '1234');
            engine.stop();
          }
          if (activityApi.id === 'task') {
            rej('Should not wait on task');
          }
        });

        engine.execute({ listener }, (err) => {
          if (err) rej(err);

          engine.getState().then(state => {
            listener = new EventEmitter2();
            listener.on('wait', (activityApi) => {
              try {
              /*
              /// HACK HACK HACK
              const activity = getProcess(state).getChildren(activityApi.id);
              if (activity && activity.behaviour.form) activityApi.owner.behaviour.io.getForm().resume(activity.behaviour);
              // FINE HACK
              */
                const form = activityApi.owner.getForm();
                const field = form.getField('formfield1');
                expect(field.get()).to.equal('stop');
                res();
              } catch (ex) {
                rej(ex);
              }
            });

            const recovered = getEngine({ source}).recover(state);

            recovered.resume({listener}).then(err => {
              if (err) rej(err);
            });
          });
        });
      });
    });


    it('resume fields ignores fields not in field set', () => {
      return new Promise((res, rej) => {
        const engine = getEngine({ source });

        let listener = new EventEmitter2();
        listener.on('wait', (activityApi) => {
          try {
            if (activityApi.id === 'start') {
              const form = activityApi.owner.getForm();
              form.setFieldValue('formfield1', 'stop');
              form.setFieldValue('formField2', '1234');
              engine.stop();
              return;
            }
          } catch (ex) {
            rej(ex);
          }
          rej('Should not wait on task');
        });

        engine.execute({ listener }, (err) => {
          if (err) rej(err);

          engine.getState().then(state => {
            const start = getProcess(state).getChildren('start');
            start.behaviour.state.form.fields.splice(1, 1);
            start.behaviour.state.form.fields.push({
              id: 'arb', value: 'xxxx'
            });
            listener = new EventEmitter2();
            listener.on('wait', (activityApi) => {
              try {
                /*
              /// HACK HACK HACK
                const activity = getProcess(state).getChildren(activityApi.id);
                if (activity && activity.behaviour.form) activityApi.owner.behaviour.io.getForm().resume(activity.behaviour);
                // FINE HACK
                */
                const form = activityApi.owner.getForm();
                expect(form.getOutput()).to.deep.equal({ formfield1: 'stop' });
                res();
              } catch (ex) {
                rej(ex);
              }
            });
            const recovered = getEngine({ source }).recover(state);

            recovered.resume({listener}).then(resumeErr => {
              rej(resumeErr);
            });
          });
        });
      });
    });
  });
});
