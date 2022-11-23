'use strict';

const InputOutput = require('../../../resources/camunda/InputOutput');
const {getDefinition, getEngine, getEnvironment, testEngine, initEngine } = require('../../helpers/testHelpers');
const { expect } = require('chai');
const { EventEmitter2 } = require('eventemitter2');

const parentApi = { id: 'test' };

describe('Activity InputOutput', () => {
  describe('behaviour', () => {
    it('script parameter throws if type is not JavaScript', (done) => {
      function test() {
        InputOutput({
          $type: 'camunda:InputOutput',
          inputParameters: [{
            $type: 'camunda:inputParameter',
            name: 'message',
            definition: {
              $type: 'camunda:script',
              scriptFormat: 'CoffeeScript',
              value: 'i in loop'
            }
          }]
        }, {
          environment: getEnvironment()
        }).activate(parentApi);
      }

      expect(test).to.throw(Error, /CoffeeScript is unsupported/i);
      done();
    });

    it('no parameters are ok', (done) => {
      const io = new InputOutput({
        $type: 'camunda:InputOutput',
        inputParameters: [],
        outputParameters: []
      }, {
        environment: getEnvironment()
      });

      const activatedIo = io.activate(parentApi, {});
      expect(activatedIo.getInput()).to.eql({});
      expect(activatedIo.getOutput()).to.eql({});

      done();
    });
  });

  describe('getInput()', () => {
    it('returns static values', (done) => {
      const io = new InputOutput({
        $type: 'camunda:InputOutput',
        inputParameters: [{
          $type: 'camunda:inputParameter',
          name: 'taskinput',
          value: 'Empty'
        }],
        outputParameters: [{
          $type: 'camunda:outputParameter',
          name: 'message',
          value: 'I\'m done'
        }, {
          $type: 'camunda:outputParameter',
          name: 'arbval',
          value: '1'
        }]
      }, {
        environment: getEnvironment()
      });

      const activatedIo = io.activate(parentApi, {});
      const inputs = activatedIo.getInput();
      expect(inputs).to.eql({
        taskinput: 'Empty'
      });
      done();
    });

    it('returns script values', (done) => {
      const io = new InputOutput({
        $type: 'camunda:InputOutput',
        inputParameters: [{
          $type: 'camunda:inputParameter',
          name: 'message',
          definition: {
            $type: 'camunda:script',
            scriptFormat: 'JavaScript',
            value: '"Empty"'
          },
        }],
        outputParameters: [{
          $type: 'camunda:outputParameter',
          name: 'xxx',
          value: '1'
        }]
      }, {
        environment: getEnvironment()
      });
      const activatedIo = io.activate(parentApi, {});
      const inputs = activatedIo.getInput();
      expect(inputs).to.eql({
        message: 'Empty'
      });
      done();
    });

    it('returns script values that address variable', (done) => {
      const io = new InputOutput({
        $type: 'camunda:InputOutput',
        inputParameters: [{
          $type: 'camunda:inputParameter',
          name: 'message',
          definition: {
            $type: 'camunda:script',
            scriptFormat: 'JavaScript',
            value: '`Me too ${environment.variables.arbval}`;'
          }
        }],
        outputParameters: [{
          $type: 'camunda:outputParameter',
          name: 'arbval',
          value: '1'
        }]
      }, {
        environment: getEnvironment({ variables: { arbval: 37 }})
      });

      const activatedIo = io.activate(parentApi);
      const inputs = activatedIo.getInput();
      expect(inputs).to.eql({
        message: 'Me too 37'
      });
      done();
    });

    it('can access parentContext variables', () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" exporter="Camunda Modeler" exporterVersion="1.2.2">
        <process id="mainProcess" isExecutable="true">
          <task id="task" name="Task 1">
            <extensionElements>
              <camunda:InputOutput>
                <camunda:inputParameter name="inputMessage">
                  <camunda:script scriptFormat="JavaScript">environment.variables.input</camunda:script>
                </camunda:inputParameter>
                <camunda:outputParameter name="message">
                  <camunda:script scriptFormat="JavaScript"><![CDATA[inputMessage + environment.variables.arbval]]>;</camunda:script>
                </camunda:outputParameter>
              </camunda:InputOutput>
            </extensionElements>
          </task>
        </process>
      </definitions>`;

      return testEngine({ source
        , variables: { arbval: 37, input: 11 }
      }, ({ engine, listener, res, rej }) => {
        listener.on('activity.start', (api) => {
          try {
            const input = api.owner.getInput();
            expect(input).to.be.ok;
            expect(input).to.deep.equal({ inputMessage: 11 });
            res();
          } catch (ex) {
            rej(ex);
          }
        });

        engine.execute({ listener }, (err) => {
          if (err) rej(err);
          rej('should not get here');
        });
      });
    });
  });

  describe('getOutput()', () => {

    it('returns static values', (done) => {
      const io = InputOutput({
        $type: 'camunda:InputOutput',
        inputParameters: [{
          $type: 'camunda:inputParameter',
          name: 'taskinput',
          value: 'Empty'
        }],
        outputParameters: [{
          $type: 'camunda:outputParameter',
          name: 'message',
          value: 'I\'m done'
        }, {
          $type: 'camunda:outputParameter',
          name: 'arbval',
          value: '1'
        }]
      }, {
        environment: getEnvironment()
      });

      expect(io.activate(parentApi, {}).getOutput()).to.eql({
        message: 'I\'m done',
        arbval: '1'
      });
      done();
    });

    it('returns script values', (done) => {
      const io = new InputOutput({
        $type: 'camunda:InputOutput',
        outputParameters: [{
          $type: 'camunda:outputParameter',
          name: 'message',
          definition: {
            $type: 'camunda:script',
            scriptFormat: 'JavaScript',
            value: '"Me too"'
          }
        }, {
          $type: 'camunda:outputParameter',
          name: 'arbval',
          value: '1'
        }]
      }, {
        environment: getEnvironment()
      });
      expect(io.activate(parentApi, {}).getOutput()).to.eql({
        message: 'Me too',
        arbval: '1'
      });
      done();
    });

    it('returns script values that context property', (done) => {
      const io = new InputOutput({
        $type: 'camunda:InputOutput',
        outputParameters: [{
          $type: 'camunda:outputParameter',
          name: 'message',
          definition: {
            $type: 'camunda:script',
            scriptFormat: 'JavaScript',
            value: '`I am ${variables.arbval}`;'
          }
        }, {
          $type: 'camunda:outputParameter',
          name: 'arbval',
          value: '1'
        }]
      }, {
        environment: getEnvironment({ variables: { arbval: 11 }})
      });
      expect(io.activate(parentApi, {
        variables: {
          arbval: 'the random value 4'
        }
      }).getOutput()).to.eql({
        message: 'I am the random value 4',
        arbval: '1'
      });
      done();
    });

    it('empty parameter definition returns empty', (done) => {
      const io = new InputOutput({
        $type: 'camunda:InputOutput',
        outputParameters: [{
          $type: 'camunda:outputParameter',
          name: 'message',
          definition: {}
        }]
      }, {
        environment: getEnvironment()
      });

      expect(io.activate(parentApi, {
      }).getOutput()).to.eql({});

      done();
    });

    it('no parameter definition returns empty', (done) => {
      const io = new InputOutput({
        $type: 'camunda:InputOutput',
        outputParameters: [{
          $type: 'camunda:outputParameter',
          name: 'message'
        }]
      }, {
        environment: getEnvironment()
      });

      expect(io.activate(parentApi, {}).getOutput()).to.eql({});

      done();
    });

    it('unknown definition type returns empty', (done) => {
      const io = new InputOutput({
        $type: 'camunda:InputOutput',
        outputParameters: [{
          $type: 'camunda:outputParameter',
          name: 'message',
          definition: {
            $type: 'madeup:script',
            scriptFormat: 'JavaScript',
            value: '`Me too ${variables.arbval}`;'
          }
        }]
      }, {
        environment: getEnvironment()
      });

      expect(io.activate(parentApi, {
        variables: {
          arbval: 10
        }
      }).getOutput()).to.eql({});

      done();
    });

    it('output can access parentContext variables', (done) => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" exporter="Camunda Modeler" exporterVersion="1.2.2">
        <process id="mainProcess" isExecutable="true">
          <task id="task" name="Task 1">
            <extensionElements>
              <camunda:InputOutput>
                <camunda:inputParameter name="inputMessage">
                  <camunda:script scriptFormat="JavaScript">environment.variables.input</camunda:script>
                </camunda:inputParameter>
                <camunda:outputParameter name="message">
                  <camunda:script scriptFormat="JavaScript"><![CDATA[variables.inputMessage + environment.variables.arbval]]>;</camunda:script>
                </camunda:outputParameter>
              </camunda:InputOutput>
            </extensionElements>
          </task>
        </process>
      </definitions>`;

      initEngine(source).then(({ definition }) => {
        definition.environment.assignVariables({input: 11, arbval: 11});

        const task = definition.getActivityById('task');
        task.once('end', () => {
          expect(task.behaviour.io.getOutput()).to.eql({message: 22});
          done();
        });
        task.run();
      }).catch(ex => {
        console.error(ex);
      });
    });
  });

  it('supports type map', (done) => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <serviceTask id="Task_15g4wm5" name="Dummy Task" implementation="\${environment.services.dummy}">
          <extensionElements>
            <camunda:inputOutput>
              <camunda:inputParameter name="templateId">template_1234</camunda:inputParameter>
              <camunda:inputParameter name="templateArgs">
                <camunda:map>
                  <camunda:entry key="url"><![CDATA[\${environment.services.getUrl('task1')}]]></camunda:entry>
                </camunda:map>
              </camunda:inputParameter>
              <camunda:outputParameter name="serviceResult">\${result}</camunda:outputParameter>
            </camunda:inputOutput>
          </extensionElements>
        </serviceTask>
      </process>
    </definitions>`;
    const localEngine = getEngine(source, {
      emailAddress: 'lisa@example.com'
    });
    localEngine.execute({
      services: {
        dummy: (_, serviceCallback) => {
          serviceCallback(null, 'dummy');
        },
        getUrl: (path) => {
          return `http://example.com/${path}`;
        }
      },
    });

    localEngine.once('end', (execution) => {
      const task = execution.getActivityById('Task_15g4wm5');
      expect(task).to.not.be.null;
      const taskOutput = task.behaviour.io.getOutput();
      expect(taskOutput).to.not.be.null;
      expect(taskOutput.serviceResult).to.not.be.null;
      expect(taskOutput.serviceResult).to.eql(['dummy']);
      done();
    });
  });
});
