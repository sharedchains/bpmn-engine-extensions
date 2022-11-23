'use strict';

const { getEngine, getProcess, testEngine } = require('../../helpers/testHelpers');
const { processResume, saveOutputToEnv } = require('../../helpers/extensionsHacks');
const EventEmitter2 = require('eventemitter2');
const { expect } = require('chai');


describe('formKey', () => {
  let source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="testFormKey" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" camunda:formKey="form1" />
      </process>
    </definitions>`;
  it('start event emits wait', () => {

    return testEngine(source, ({ listener, engine, res, rej }) => {

      listener.once('wait', (activityApi) => {
        try {
          const { behaviour } = activityApi.owner;
          expect(behaviour).to.have.property('form');
          res();
        } catch (ex) {
          rej(ex);
        }
      });

      engine.execute({ listener }, (err) => {
        if (err) rej(err);
        rej('should not terminate');
      });
    });
  });

  it('saves form data in local output', () => {
    return testEngine(source, ({ listener, engine, res, rej }) => {

      listener.once('wait', (activityApi) => {
        try {
          const form = activityApi.owner.getForm();
          form.setFieldValue('key', form.id);
          form.setFieldValue('someField', 'someValue');
          activityApi.signal();
        } catch (ex) {
          rej(ex);
        }
      });

      listener.once('activity.end', ({ owner }) => {
        try {
          const { form } = owner.behaviour;
          engine.logger.debug(form);
          expect(form.getFieldValue('key')).to.equal('form1');
          expect(form.getFieldValue('someField')).to.equal('someValue');
          expect(owner.behaviour.form.getOutput()).to.eql({
            key: 'form1'
            , someField: 'someValue'
          });
          expect(owner.behaviour.form.formKey).to.eql('form1');
          res();
        } catch (ex) {
          rej(ex);
        }
      });

      engine.execute({ listener }, (err) => {
        if (err) rej(err);
        rej('should not terminate');
      });
    });
  });

  it('saves form data in environment', () => {
    return testEngine(source, ({ listener, engine, res, rej }) => {

      listener.once('wait', (activityApi) => {
        try {
          const form = activityApi.owner.getForm();
          form.setFieldValue('key', form.id);
          form.setFieldValue('someField', 'someValue');
          activityApi.signal();
        } catch (ex) {
          rej(ex);
        }
      });

      listener.once('activity.end', ({environment}) => {
        try {
          engine.logger.debug(environment.variables);
          const { variables } = environment;
          expect(variables).to.deep.include({
            key: 'form1'
            , someField: 'someValue'
          });
          res();
        } catch (ex) {
          rej(ex);
        }
      });

      engine.execute({ listener }, (err) => {
        if (err) rej(err);
        rej('should not terminate');
      });
    });
  });
  it('sets key value with expression', () => {
    source = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions id="testFormKey" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
  <process id="theProcess" isExecutable="true">
    <startEvent id="start" camunda:formKey="\${environment.variables.inputForm}" />
    <userTask id="task" camunda:formKey="\${formKey}">
      <extensionElements>
        <camunda:InputOutput>
          <camunda:inputParameter name="formKey">MyForm</camunda:inputParameter>
          <camunda:outputParameter name="key">\${key}</camunda:outputParameter>
        </camunda:InputOutput>
      </extensionElements>
    </userTask>
    <endEvent id="end" />
    <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
    <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
  </process>
</definitions>`;

    return testEngine({
      source
      , variables: {
        inputForm: 'form1'
      }
    }, env => {
      const { engine, listener, res, rej } = env;

      listener.on('activity.wait', (activityApi) => {
        const { owner } = activityApi;
        try {
          if (activityApi.id === 'start') {
            expect(owner.getForm().formKey).to.equal('form1');
            activityApi.signal({ inputForm: 'form2' });
          }
          if (activityApi.id === 'task') {
            expect(owner.getForm().formKey).to.equal('MyForm');
            activityApi.signal({ key: owner.getForm().formKey });
          }
        } catch (ex) {
          rej(ex);
        }
      });

      listener.on('process.end', (execution) => {
        try {
          expect(execution.environment.output).to.eql({
            start: { inputForm: 'form2' }
            , task: { key: 'MyForm' }
          });
          expect(execution.environment.variables).to.deep.include({
            inputForm: 'form2'
            , key: 'MyForm'
          });
          res();
        } catch (ex) {
          rej(ex);
        }
      });

      engine.execute({listener}, (err) => {
        if (err) rej(err);
        rej('should not be here');
      });
    });
  });

  it('getState() returns formKey value', () => {
    source = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions id="testFormKey" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
  <process id="theProcess" isExecutable="true">
    <startEvent id="start" camunda:formKey="\${environment.variables.inputForm}" />
    <userTask id="task" camunda:formKey="\${environment.variables.inputForm}" />
    <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
  </process>
</definitions>`;

    return testEngine({ source
      , variables: { inputForm: 'input' }
    }, env => {
      const { listener, engine, res, rej } = env;
      listener.once('activity.wait', () => {
        engine.stop();
      });

      listener.once('activity.stop', () => {
        engine.getState().then(state => {
          const start = getProcess(state, 'theProcess').execution.children.find(child => child.id === 'start');

          try {
            expect(start.behaviour).to.have.property('state');
            expect(start.behaviour.state).to.have.property('form');
            expect(start.behaviour.state.form).to.deep.equal({ formKey: 'input' });
          } catch (ex) {
            rej(ex);
          }
        });
      });

      engine.on('stop', (execution) => {
        // HERE WE TEST ON EXECUTION..
        try {
          const state = execution.getState();
          expect(state).to.be.ok;

          const start = getProcess(state, 'theProcess').getChildren('start');
          expect(start).to.be.ok;

          expect(start.behaviour).to.have.property('state');
          expect(start.behaviour.state).to.have.property('form');
          expect(start.behaviour.state.form).to.deep.equal({ formKey: 'input' });
        } catch (ex) {
          rej(ex);
        }
      });

      engine.execute({listener}, (err, execution) => {
        if (err) rej(err);
        // CHECK ON Engine return value
        try {
          const state = execution.getState();

          expect(state).to.be.ok;

          const start = getProcess(state, 'theProcess').getChildren('start');
          expect(start).to.be.ok;

          expect(start.behaviour).to.have.property('state');
          expect(start.behaviour.state).to.have.property('form');
          expect(start.behaviour.state.form).to.deep.equal({ formKey: 'input' });
          res();
        } catch (ex) {
          rej(ex);
        }
      });
    });
  });

  it('resumes task with resolved formKey value', () => {
    source = `
    <?xml version="1.0" encoding="UTF-8"?>
<definitions id="testFormKeyDef" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
  <process id="theProcess" isExecutable="true">
    <startEvent id="start" camunda:formKey="\${environment.variables.inputForm}">
      <outgoing>flow1</outgoing>
    </startEvent>
    <userTask id="task" camunda:formKey="\${environment.variables.inputForm}-\${environment.output.start.user}-\${environment.output.start.pass}">
      <incoming>flow1</incoming>
      <outgoing>flow2</outgoing>
    </userTask>
    <endEvent id="end">
      <incoming>flow2</incoming>
    </endEvent>
    <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
    <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
  </process>
</definitions>`;

    let state;
    return testEngine({
      source
      , extensions: { processResume }
      , variables: {
        inputForm: 'input'
      }
    }
    , ({engine, listener, res, rej}) => {
      /**
         * test callback
         */
      listener.on('wait', async (activityApi) => {
        try {
          if (activityApi.id === 'start') {
            const form = activityApi.owner.getForm();
            expect(form.formKey).to.equal('input');

            form.setFieldValue('user', 'name');
            form.setFieldValue('pass', 'word');
            activityApi.signal();
          }
          if (activityApi.id === 'task') {
            state = await engine.getState();
            engine.stop();
          }
        } catch (ex) {
          rej(ex);
        }
      });

      engine.execute({listener}, (err) => {
        if (err) rej(err);

        let process;
        try {
          process = getProcess(state, 'theProcess');
          process.environment.variables = {inputForm: 'output'};

          const start = process.getChildren('start');
          expect(start.stopped).to.not.be.ok;
        } catch (ex) {
          rej(ex);
        }

        const listener2 = new EventEmitter2();

        let waitOnStart = false;
        let waitOnTask = false;
        listener2.on('wait', (activityApi) => {
          try {
            if (activityApi.id === 'start') {
              const { behaviour } = activityApi.owner;
              waitOnStart = true;
              expect(behaviour.form.formKey).to.equal('input');
              activityApi.signal();
            }
            if (activityApi.id === 'task') {
              waitOnTask = true;
              activityApi.signal({
                myKey: activityApi.owner.behaviour.form.formKey
              });
            }
          } catch (ex) {
            rej(ex);
          }
        });

        listener2.on('process.end', (execution) => {
          try {
            expect(waitOnStart).to.be.false;
            expect(waitOnTask).to.be.true;
            expect(execution.environment.output).to.deep.equal({
              start: { 'user': 'name', 'pass': 'word' },
              task: { 'myKey': 'input-name-word' }, // task already activated at resume
            });
            res();
          } catch (ex) {
            rej(ex);
          }
        });

        const resumed = getEngine({ extensions: { saveOutputToEnv, processResume } }).recover(state);
        return resumed.resume({listener: listener2}, (err2) => {
          if (err2) rej(err2);
          rej('should not be here');
        });
      }); // doneCallback
    });
  });

  it('resumes start with resolved formKey value', () => {
    source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="testFormKeyDef" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" camunda:formKey="\${environment.variables.inputForm}">
          <outgoing>flow1</outgoing>
        </startEvent>
        <userTask id="task" camunda:formKey="\${environment.variables.inputForm}-\${environment.variables.user}-\${environment.variables.pass}">
          <incoming>flow1</incoming>
          <outgoing>flow2</outgoing>
        </userTask>
        <endEvent id="end">
          <incoming>flow2</incoming>
        </endEvent>
        <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
        <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
      </process>
    </definitions>`;

    let state;
    return testEngine({
      source
      , variables: {
        inputForm: 'input'
      }
    }
    , ({engine, listener, res, rej}) => {
      /**
         * test callback
         */
      listener.on('wait', async (activityApi) => {
        if (activityApi.id === 'start') {
          try {
            const form = activityApi.owner.getForm();
            expect(form.formKey).to.equal('input');

            form.setFieldValue('user', 'name');
            form.setFieldValue('pass', 'word');
            state = await engine.getState();
            engine.stop();
          } catch (ex) {
            rej(ex);
          }
        }
      });

      engine.execute({listener}, (err) => {
        if (err) rej(err);

        let process;
        try {
          process = getProcess(state, 'theProcess');
          expect(process.environment.variables).to.have.property('inputForm');
          process.environment.variables.inputForm = 'output';

          const start = process.getChildren('start');
          expect(start.stopped).to.not.be.ok;
          expect(start.isStart).to.be.true;
          expect(start.status).to.equal('executing');
        } catch (ex) {
          rej(ex);
        }

        const listener2 = new EventEmitter2();

        let waitOnStart = false;
        let waitOnTask = false;
        listener2.on('wait', (activityApi) => {
          try {
            if (activityApi.id === 'start') {
              const { owner } = activityApi;
              const { behaviour} = owner;
              // WAITING with field values set.. save fields 'set'
              expect(owner.getOutput()).to.deep.equal({ user: 'name', pass: 'word' });
              expect(behaviour.form.formKey).to.equal('input');
              waitOnStart = true;
              activityApi.signal();
            }
            if (activityApi.id === 'task') {
              waitOnTask = true;
              activityApi.signal({
                myKey: activityApi.owner.behaviour.form.formKey
              });
            }
          } catch (ex) {
            rej(ex);
          }
        });

        listener2.on('process.end', (execution) => {
          try {
            expect(waitOnStart).to.be.true;
            expect(waitOnTask).to.be.true;
            expect(execution.environment.variables).to.deep.include({
              user: 'name'
              , pass: 'word'
              , inputForm: 'output'
              , myKey: 'output-name-word'
            });
            res();
          } catch (ex) {
            rej(ex);
          }
        });

        const resumed = getEngine({ extensions: { saveOutputToEnv } }).recover(state);

        return resumed.resume({listener: listener2}, (err2) => {
          if (err2) rej(err2);
          rej('should not be here');
        });
      });
    });
  });
});
