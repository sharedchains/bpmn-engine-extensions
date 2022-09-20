'use strict';

const InputOutput = require('../../../resources/camunda/InputOutput');
const camundaExtensions = require('../../../resources/camunda');
const {Engine} = require('bpmn-engine');
const {getDefinition} = require('../../helpers/testHelpers');
const debug = require('debug');
const { expect } = require('chai');
debug.enable('*');

describe('Activity InputOutput', () => {
  const engine = new Engine({
    source: null,
    extensions: { camunda: camundaExtensions.extension },
    moddleOptions: { camunda: camundaExtensions.moddleOptions },
    variables: {
      arbval: 37
    }
  });
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
          environment: engine.environment
        }).activate();
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
        environment: engine.environment
      });

      const activatedIo = io.activate({}, {});
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
        environment: engine.environment
      });

      const activatedIo = io.activate({}, {});
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
        environment: engine.environment
      });
      const activatedIo = io.activate({}, {});
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
        environment: engine.environment
      });

      const activatedIo = io.activate();
      const inputs = activatedIo.getInput();
      expect(inputs).to.eql({
        message: 'Me too 37'
      });
      done();
    });

    it('can access parentContext variables', (done) => {
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

      getDefinition(source, camundaExtensions).then((definition) => {
        const env = definition.environment;
        env.addService('task', (message) => {
          debug('task: execute with message: %o', message);
        });
        env.assignVariables({input: 11});

        const svc = env.getServiceByName('task');
        expect(svc).to.not.be.null;

        const task = definition.getActivityById('task');

        task.once('start', () => {
          const inputs = task.behaviour.getInput();
          expect(inputs).to.eql({inputMessage: 11});
          done();
        });

        task.run();
      }).catch(done);
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
        environment: engine.environment
      });

      expect(io.activate({}, {}).getOutput()).to.eql({
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
        environment: engine.environment
      });
      expect(io.activate({}, {}).getOutput()).to.eql({
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
            value: '`Me too ${variables.arbval}`;'
          }
        }, {
          $type: 'camunda:outputParameter',
          name: 'arbval',
          value: '1'
        }]
      }, {
        environment: engine.environment
      });
      expect(io.activate({}, {
        variables: {
          arbval: 10
        }
      }).getOutput()).to.eql({
        message: 'Me too 10',
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
        environment: engine.environment
      });

      expect(io.activate({}, {
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
        environment: engine.environment
      });

      expect(io.activate({}, {}).getOutput()).to.eql({});

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
        environment: engine.environment
      });

      expect(io.activate({}, {
        variables: {
          arbval: 10
        }
      }).getOutput()).to.eql({});

      done();
    });

    it('can access parentContext variables', (done) => {
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

      getDefinition(source, camundaExtensions).then((definition) => {
        definition.environment.assignVariables({input: 11, arbval: 11});

        const task = definition.getActivityById('task');
        task.once('end', () => {
          expect(task.behaviour.getOutput()).to.eql({message: 22});
          done();
        });
        task.run();
      }).catch(done);
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
                  <camunda:entry key="url"><![CDATA[\${services.getUrl('task1')}]]></camunda:entry>
                </camunda:map>
              </camunda:inputParameter>
              <camunda:outputParameter name="serviceResult">\${result}</camunda:outputParameter>
            </camunda:inputOutput>
          </extensionElements>
        </serviceTask>
      </process>
    </definitions>`;
    const localEngine = new Engine({
      source: source,
      extensions: { camunda: camundaExtensions.extension },
      moddleOptions: { camunda: camundaExtensions.moddleOptions }
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
      variables: {
        emailAddress: 'lisa@example.com'
      }
    });

    localEngine.once('end', (execution) => {
      const task = execution.getActivityById('Task_15g4wm5');
      expect(task).to.not.be.null;
      const taskOutput = task.behaviour.getOutput();
      expect(taskOutput).to.not.be.null;
      expect(taskOutput.serviceResult).to.not.be.null;
      expect(taskOutput.serviceResult).to.eql(['dummy']);
      done();
    });
  });
});
