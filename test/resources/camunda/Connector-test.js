'use strict';

const factory = require('../../helpers/factory');
const {initEngine, debug, apiHost, getNockGet} = require('../../helpers/testHelpers');
const got = require('got');
const { uniqueID } = require('mocha/lib/utils');

describe('Connector', () => {
  describe('input/output', () => {
    let context;
    beforeEach((done) => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="sendEmail_1" name="send mail">
            <extensionElements>
              <camunda:connector>
                <camunda:inputOutput>
                  <camunda:inputParameter name="to" />
                  <camunda:inputParameter name="subject">Resolved \${ticketId}</camunda:inputParameter>
                  <camunda:inputParameter name="message">
                    <camunda:list>
                      <camunda:value>Your ticket \${ticketId} was resolved.</camunda:value>
                      <camunda:value>Best regards,</camunda:value>
                      <camunda:value>\${supportEmail}</camunda:value>
                    </camunda:list>
                  </camunda:inputParameter>
                </camunda:inputOutput>
                <camunda:connectorId>sendEmail</camunda:connectorId>
              </camunda:connector>
              <camunda:inputOutput>
                <camunda:inputParameter name="to" value="\${environment.variables.emailAddress}" />
                <camunda:inputParameter name="ticketId" value="987654" />
                <camunda:inputParameter name="supportEmail" value="support@example.com" />
              </camunda:inputOutput>
            </extensionElements>
          </serviceTask>
          <serviceTask id="sendEmail_2" name="send mail">
            <extensionElements>
              <camunda:connector>
                <camunda:connectorId>sendEmail</camunda:connectorId>
              </camunda:connector>
            </extensionElements>
          </serviceTask>
          <serviceTask id="ping" name="ping">
            <extensionElements>
              <camunda:connector>
                <camunda:inputOutput>
                  <camunda:outputParameter name="pinged" value="\${true}" />
                </camunda:inputOutput>
                <camunda:connectorId>ping</camunda:connectorId>
              </camunda:connector>
              <camunda:inputOutput>
                <camunda:outputParameter name="pinged" value="\${pinged}" />
              </camunda:inputOutput>
            </extensionElements>
          </serviceTask>
        </process>
      </definitions>`;
      initEngine(source).then(({definition}) => {
        context = definition;
        done();
      });
    });

    describe('connector input', () => {
      it('calls service with connector input as arguments', (done) => {
        // eslint-disable-next-line no-unused-vars
        context.environment.addService('sendEmail', (serviceContext, _callback) => {
          const { to, subject, message } = serviceContext.variables;
          expect(to).to.equal('to@example.com');
          expect(subject).to.equal('Resolved 987654');
          expect(message).to.eql(['Your ticket 987654 was resolved.', 'Best regards,', 'support@example.com']);
          done();
        });
        context.environment.assignVariables({emailAddress: 'to@example.com'});

        const task = context.getActivityById('sendEmail_1');
        task.run();
      });

      it('unresolved arguments are passed as undefined', (done) => {
        // eslint-disable-next-line no-unused-vars
        context.environment.addService('sendEmail', (serviceContext, _callback) => {
          const { to, subject, message } = serviceContext.variables;
          expect(to).to.equal(undefined);
          expect(subject).to.equal('Resolved 987654');
          expect(message).to.eql(['Your ticket 987654 was resolved.', 'Best regards,', 'support@example.com']);
          done();
        });

        const task = context.getActivityById('sendEmail_1');
        task.run();
      });

      it('service is called with activity input context if without connector input', (done) => {
        context.environment.addService('sendEmail', (inputContext) => {
          console.error(inputContext);
          expect(inputContext.variables).to.eql({
            ticketId: '987654'
          });
          done();
        });
        context.environment.assignVariables({ticketId: '987654'});

        const task = context.getActivityById('sendEmail_2');
        task.run();
      });
    });

    describe('output', () => {
      it('resolves activity output from connector output', (done) => {
        context.environment.addService('ping', (c, next) => {
          next(null, 'true');
        });
        const task = context.getActivityById('ping');

        /**
         * CAUTION: result is string "true" but outputParameter of connector is
         * set to fixed boolean 'true' thus the result is a boolean and not a text
         */
        task.once('end', (activityApi) => {
          expect(activityApi.content.output).to.eql({
            pinged: true
          });
          done();
        });

        task.run();
      });
    });
  });

  describe('Camunda connector is defined with input/output', () => {
    let definition;
    before((done) => {
      initEngine({
        source: factory.resource('issue-4.bpmn')
        , variables: { emailAddress: 'lisa@example.com' }
        , services: {
          ['send-email']: (_context, callback) => {
            callback(null, 'success');
          }
        }
      }).then((env) => {
        definition = env.definition;
        done();
      });
    });

    /**
     * Changed. behaviour is populated after activation
     */
    it('service task has io', (done) => {
      const task = definition.getActivityById('sendEmail_1');
      task.once('start', () => {
        expect(task.behaviour.io, 'task IO').to.be.ok;
        done();
      });
      task.run();
    });

    it('executes connector-id service', (done) => {
      const task = definition.getActivityById('sendEmail_1');
      task.once('end', (activityApi) => {
        const { output } = activityApi.content;
        expect(output).to.eql({
          messageId: 'success',
        });
        done();
      });

      task.run();
    });

    it('executes service using defined input', (done) => {
      const task = definition.getActivityById('sendEmail_1');
      let serviceInput = null;
      let taskInput = null;

      definition.environment.assignVariables({emailAddress: 'lisa@example.com'});
      definition.environment.addService('send-email', (inputContext, callback) => {
        serviceInput = inputContext.variables.emailAddress;
        callback(null, 'success');
      });

      task.once('start', (executionContext) => {
        expect(executionContext.id, 'sendEmail_1'); // paranoiacheck
        expect(task.behaviour.io).to.be.ok;
        taskInput = task.behaviour.io.getInput();
      });
      task.once('end', () => {
        expect(serviceInput).to.equal('lisa@example.com');
        expect(taskInput).to.eql({
          emailAddress: 'lisa@example.com'
        });
        done();
      });

      task.run();
    });

    it('returns defined output', (done) => {
      const task = definition.getActivityById('sendEmail_1');

      definition.environment.addService('send-email', (inputContext, callback) => {
        callback(null, 10);
      });

      task.once('end', () => {
        const output = task.behaviour.io.getOutput();
        expect(output).to.eql({
          messageId: 10,
        });
        done();
      });

      task.run();
    });
  });

  describe('misc', () => {
    it('service expects input options', () => {
      return new Promise( (res, rej) => {

        const apiPath = '/v1/data';
        const source = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
  <process id="theProcess" isExecutable="true">
    <serviceTask id="serviceTask" name="Call api">
      <extensionElements>
        <camunda:connector>
          <camunda:connectorId>get</camunda:connectorId>
        </camunda:connector>
        <camunda:inputOutput>
          <camunda:inputParameter name="url">\${environment.variables.api}${apiPath}</camunda:inputParameter>
          <camunda:inputParameter name="responseType">json</camunda:inputParameter>
          <camunda:inputParameter name="headers">
            <camunda:map>
              <camunda:entry key="User-Agent">curl</camunda:entry>
              <camunda:entry key="Accept">application/json</camunda:entry>
            </camunda:map>
          </camunda:inputParameter>
          <camunda:outputParameter name="statusCode">\${result[0].statusCode}</camunda:outputParameter>
          <camunda:outputParameter name="body">\${result[1]}</camunda:outputParameter>
        </camunda:inputOutput>
      </extensionElements>
    </serviceTask>
  </process>
</definitions>`;

        let inputVars = null;
        getNockGet(apiHost, apiPath)
          .reply(200, {
            data: 4
          });

        initEngine({
          source
          , variables: { api: apiHost }
          , services: {
            get: (inputContext, callback) => {
              inputVars = inputContext.variables;
              got(inputVars).then((response) => {
                callback(null, [ { statusCode: response.statusCode }, response.body ]);
              }).catch(err => {
                callback(err);
              });
            }
          }
        }).then(({ definition }) => {

          const task = definition.getActivityById('serviceTask');

          task.once('end', (executionContext) => {
            try {
              expect(inputVars.url).to.eql(apiHost + apiPath);
              expect(inputVars.responseType).to.eql('json');
              expect(inputVars.headers).to.eql( { 'User-Agent': 'curl', Accept: 'application/json' });
              // actually this is input test.. not output test..
              task.behaviour.io.setResult(executionContext.content.output);
              const output = task.behaviour.io.getOutput();
              expect(output).to.eql({
                statusCode: 200,
                body: {data: 4}
              });
              res();
            } catch (ex) {
              rej(ex);
            }
          });

          task.run();
        });
      });
    });

    it('service function address other service function', (done) => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="serviceTask" name="Call api">
            <extensionElements>
              <camunda:connector>
                <camunda:connectorId>myFunc</camunda:connectorId>
              </camunda:connector>
              <camunda:inputOutput>
                <camunda:inputParameter name="variables">\${environment.variables}</camunda:inputParameter>
                <camunda:inputParameter name="services">\${environment.services}</camunda:inputParameter>
                <camunda:outputParameter name="message">\${result}</camunda:outputParameter>
              </camunda:inputOutput>
            </extensionElements>
          </serviceTask>
        </process>
      </definitions>`;

      initEngine(source).then(({ definition }) => {
        definition.environment.addService('appendPath', (inputContext, callback) => {
          callback(null, `${inputContext.variables.api}/v3/data`);
        });
        definition.environment.addService('myFunc', (message, callback) => {
          message.variables.services.appendPath(message, (err, data) => {
            callback(err, `successfully executed with ${data}`);
          });
        });
        definition.environment.assignVariables({
          api: apiHost
        });

        const task = definition.getActivityById('serviceTask');

        task.once('end', (executionContext) => {
          task.behaviour.io.setResult(executionContext.content.output);
          const output = task.behaviour.io.getOutput();
          expect(output).to.eql({
            message: 'successfully executed with ' + apiHost + '/v3/data'
          });
          done();
        });

        task.run();
      });
    });
  });

  describe('loop', () => {
    describe('sequential', () => {
      let definition;
      beforeEach(done => {
        getLoopDefinition(true).then(env => {
          definition = env.definition;
          done();
        });
      });

      it('emits start with task id', () => {
        return new Promise((res, rej) => {
          const task = definition.getActivityById('task');
          task.activate();

          getNockGet(apiHost, '/api/pal?version=0')
            .delay(50)
            .reply(200, { })
            .get('/api/franz?version=1')
            .delay(30)
            .reply(200, { })
            .get('/api/immanuel?version=2')
            .reply(200, { });

          const starts = [];

          task.broker.subscribe('execution', 'execute.start', null, (eventName, message) => {
            try {
              debug(eventName);
              /** 
               * there is a first call to execute start wuth isRootScope=true
               * in this case the parentId = parallellLoopProcess
               */
              if (message.content.isRootScope) {
                expect(message.content.parent.id).to.equal('parallellLoopProcess');
                return;
              }

              expect(message.content.parent.id).to.equal('task');
              starts.push(message.content.id);
            } catch (ex) {
              rej(ex);
            }
          }, { noAck: true, consumerTag: uniqueID(), durable: true} );

          task.on('end', () => {
            try {
              expect(starts).to.deep.equal(['task', 'task', 'task']);
              res();
            } catch (ex) {
              rej(ex);
            }
          });

          task.run();
        });
      });

      it('emits end when completed', () => {
        return new Promise((res) => {
          const task = definition.getActivityById('task');
          task.activate();

          task.broker.subscribe('execution', 'execute.start', null, (_, message) => {
            if (message.content.isRootScope) return;

            const input = message.content;
            debug(`/api${input.item}?version=${input.index}`);
            getNockGet(apiHost, `/api${input.item}?version=${input.index}`)
              .reply(200, {});
          }, { noAck: true, consumerTag: uniqueID(), durable: true} );

          task.on('end', () => {
            res();
          });

          task.run();
        });
      });

      it('getOutput() returns result from loop', () => {
        return new Promise((res, rej) => {

          const task = definition.getActivityById('task');
          task.activate();

          const responses = [
            { statusCode: 200, body: { pal: 'hello I\'m Pal!' } }
            , { statusCode: 200, body: { franz: 'this is Franz!' } }
            , { statusCode: 200, body: { immanuel: 'Immanuel here!' } }
          ];

          task.broker.subscribe('execution', 'execute.start', null, (eventName, message) => {
            if (message.content.isRootScope) return;

            const input = message.content;
            debug(`/api${input.item}?version=${input.index}`);
            getNockGet(apiHost, `/api${input.item}?version=${input.index}`)
              .delay(50 - input.version * 10)
              .reply(responses[input.index].statusCode, responses[input.index].body);
          }, { noAck: true, consumerTag: uniqueID(), durable: true} );

          task.on('end', (executionContext) => {
            try {
              console.log('++++++++++++++ END: %o', executionContext.content);
              const output = executionContext.content.output;
              expect(output).to.be.ok;
              expect(output).to.deep.equal(responses);
              res();
            } catch (ex) {
              rej(ex);
            }
          });

          task.run();
        });
      });
    });

    describe('parallell', () => {
      let definition;
      beforeEach((done) => {
        getLoopDefinition(false).then((env) => {
          definition = env.definition;
          done();
        });
      });

      it('emits start with different ids', () => {
        return new Promise((res, rej) => {

          getNockGet(apiHost, '/api/pal?version=0')
            .delay(20)
            .reply(200, {})
            .get('/api/franz?version=1')
            .delay(10)
            .reply(200, {})
            .get('/api/immanuel?version=2')
            .reply(200, {});

          const task = definition.getActivityById('task');
          task.activate();

          const starts = [];
          task.broker.subscribe('execution', 'execute.start', null, (eventName, message) => {
            if (message.content.isRootScope) return;
            try {
              expect(message.content.id).to.not.be.equal(task.execution.getApi().executionId);
              starts.push(message.content.executionId);
            } catch (ex) {
              rej(ex);
            }
          }, { noAck: true, consumerTag: uniqueID(), durable: true} );

          task.on('end', () => {
            try {
              expect(starts.includes(task.id), 'unique task id').to.not.be.ok;
              res();
            } catch (ex) {
              rej(ex);
            }
          });

          task.run();
        });
      });

      it('returns output in sequence', () => {
        return new Promise((res, rej) => {
          const task = definition.getActivityById('task');
          task.activate();

          const responses = [
            { statusCode: 200, body: { pal: 'hello I\'m Pal!' } }
            , { statusCode: 200, body: { franz: 'this is Franz!' } }
            , { statusCode: 200, body: { immanuel: 'Immanuel here!' } }
          ];
          getNockGet(apiHost, '/api/pal?version=0')
            .delay(500)
            .reply(responses[0].statusCode, responses[0].body)
            .get('/api/franz?version=1')
            .delay(400)
            .reply(responses[1].statusCode, responses[1].body)
            .get('/api/immanuel?version=2')
            .delay(300)
            .reply(responses[2].statusCode, responses[2].body);


          task.broker.subscribeTmp('event', '#', (event) => {
            console.error('+++++++++++++++++++++++++++++++++++ %o', event);
          })
          task.on('end', (executionContext) => {
            try {
              const output = executionContext.content.output;
              debug(executionContext.content.output);
              expect(output).to.deep.equal(responses);
              res();
            } catch (ex) {
              rej(ex);
            }
          });

          try {
           task.run();
          } catch (ex) {
            rej(ex);
          }
        });
      });

      it('getOutput() returns result from loop', () => {
        return new Promise((res, rej) => {
          const task = definition.getActivityById('task');
          task.activate();

          const responses = [
            { statusCode: 200, body: { pal: 'hello I\'m Pal!' } }
            , { statusCode: 200, body: { franz: 'this is Franz!' } }
            , { statusCode: 200, body: { immanuel: 'Immanuel here!' } }
          ];
          getNockGet(apiHost, '/api/pal?version=0')
            .delay(500)
            .reply(responses[0].statusCode, responses[0].body)
            .get('/api/franz?version=1')
            .delay(400)
            .reply(responses[1].statusCode, responses[1].body)
            .get('/api/immanuel?version=2')
            .delay(300)
            .reply(responses[2].statusCode, responses[2].body);

          task.on('end', ({ content, owner }) => {
            try {
              expect(content.output).to.deep.equal(responses);
              // TODO: getOutput is not SET!!!!
              // 
              // TODO
              res();
            } catch (ex) {
              rej(ex);
            }
          });

          task.run();
        });
      });
    });
  });

});

async function getLoopDefinition(isSequential) {
  const source = `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
    <process id="parallellLoopProcess" isExecutable="true">
      <serviceTask id="task">
        <multiInstanceLoopCharacteristics isSequential="${isSequential}" camunda:collection="\${environment.variables.paths}">
          <loopCardinality>5</loopCardinality>
        </multiInstanceLoopCharacteristics>
        <extensionElements>
          <camunda:inputOutput>
            <camunda:inputParameter name="version">\${index}</camunda:inputParameter>
            <camunda:inputParameter name="path">\${item}</camunda:inputParameter>
            <camunda:outputParameter name="loopResult">\${body}</camunda:outputParameter>
          </camunda:inputOutput>
          <camunda:connector>
            <camunda:inputOutput>
              <camunda:inputParameter name="reqOptions">
                <camunda:map>
                  <camunda:entry key="url">${apiHost}/api\${path}?version=\${version}</camunda:entry>
                  <camunda:entry key="responseType">json</camunda:entry>
                </camunda:map>
              </camunda:inputParameter>
              <camunda:outputParameter name="statusCode">\${result[0].statusCode}</camunda:outputParameter>
              <camunda:outputParameter name="body">\${result[1]}</camunda:outputParameter>
            </camunda:inputOutput>
            <camunda:connectorId>get</camunda:connectorId>
          </camunda:connector>
        </extensionElements>
      </serviceTask>
    </process>
  </definitions>`;
  return initEngine({
    source
    , variables: { paths: ['/pal', '/franz', '/immanuel'] }
    , services: {
      get: (inputContext, callback) => {
        const { variables, loopArgs } = inputContext;
        debug(`calling(idx:${loopArgs.index},item:${loopArgs.item}) ${variables.reqOptions.uri}`);
        try {
          got(variables.reqOptions).then(response => {
            debug(`(${inputContext.message.content.executionId}) reponse(idx:${loopArgs.index},item:${loopArgs.item}) ${variables.reqOptions.uri}: resCode:${response.statusCode}`);
            callback(null, [ { statusCode: response.statusCode }, response.body ]);
          }).catch(err => {
            callback(err);
          });
        } catch (ex) {
          callback(ex);
        }
      }
    }
  });
}
