'use strict';

const camundaExtensions = require('../../../resources/camunda');
const factory = require('../../helpers/factory');
const {getDefinition, debug} = require('../../helpers/testHelpers');
const nock = require('nock');
const request = require('request');
const { expect } = require('chai');
const EventEmitter2 = require('eventemitter2');
const { uniqueID } = require('mocha/lib/utils');

describe('Connector', () => {
  describe('input/output', () => {
    let context;
    beforeEach(async () => {
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
                <camunda:inputParameter name="to" value="\${emailAddress}" />
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
      context = await getDefinition(source, camundaExtensions);
    });

    describe('input', () => {
      it('calls service with connector input as arguments', (done) => {
        // eslint-disable-next-line no-unused-vars
        context.environment.addService('sendEmail', (serviceContext, _callback) => {
          const { to, subject, message } = serviceContext.inputArgs;
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
          const { to, subject, message } = serviceContext.inputArgs;
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
    before(async () => {
      const source = factory.resource('issue-4.bpmn').toString();
      definition = await getDefinition(source, camundaExtensions);
      definition.environment.addService('send-email', (inputContext, callback) => {
        callback(null, 'success');
      });
      definition.environment.assignVariables({emailAddress: 'lisa@example.com'});
    });

    it('service task has io', (done) => {
      const task = definition.getActivityById('sendEmail_1');
      expect(task.behaviour.io, 'task IO').to.be.ok;
      done();
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
      let input, inputArg;

      definition.environment.addService('send-email', (inputContext, callback) => {
        inputArg = inputContext.variables.emailAddress;
        callback(null, 'success');
      });

      task.once('start', (executionContext) => {
        expect(executionContext.id, 'sendEmail_1'); // paranoiacheck
        expect(task.behaviour.io).to.be.ok;
        input = task.behaviour.io.getInput();
      });

      task.once('end', () => {
        expect(task.behaviour.io).to.be.ok;
        const output = task.behaviour.io.getOutput();
        expect(input).to.eql({
          emailAddress: 'lisa@example.com'
        });
        expect(inputArg).to.equal('lisa@example.com');
        expect(output).to.eql({
          messageId: 'success',
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
    it('service expects input options', (done) => {
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
                <camunda:inputParameter name="uri">\${environment.variables.api}/v1/data</camunda:inputParameter>
                <camunda:inputParameter name="json">\${true}</camunda:inputParameter>
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

      nock('http://example.com', {
        reqheaders: {
          'User-Agent': 'curl',
          Accept: 'application/json'
        }})
        .defaultReplyHeaders({
          'Content-Type': 'application/json'
        })
        .get('/v1/data')
        .reply(200, {
          data: 4
        });

      getDefinition(source, camundaExtensions).then((definition) => {
        definition.environment.addService('get', (inputContext, callback) => {
          const data = Object.assign({}, inputContext.variables
            , inputContext.inputArgs[0].content.message.variables);
          request.get(data, undefined, (err, res, body) => {
            callback(err, [ res, body ]);
          });
        });
        definition.environment.assignVariables({
          api: 'http://example.com'
        });

        const task = definition.getActivityById('serviceTask');

        task.once('end', (executionContext) => {
          task.behaviour.io.setResult(executionContext.content.output);
          const output = task.behaviour.io.getOutput();
          expect(output).to.eql({
            statusCode: 200,
            body: {data: 4}
          });
          done();
        });

        task.run();
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

      getDefinition(source, camundaExtensions).then((definition) => {
        definition.environment.addService('appendPath', (inputContext, callback) => {
          callback(null, `${inputContext.variables.api}/v3/data`);
        });
        definition.environment.addService('myFunc', (message, callback) => {
          message.parentContext.environment.services.appendPath(message, (err, data) => {
            callback(err, `successfully executed with ${data}`);
          });
        });
        definition.environment.assignVariables({
          api: 'http://example.com'
        });

        const task = definition.getActivityById('serviceTask');

        task.once('end', (executionContext) => {
          task.behaviour.io.setResult(executionContext.content.output);
          const output = task.behaviour.io.getOutput();
          expect(output).to.eql({
            message: 'successfully executed with http://example.com/v3/data'
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
      beforeEach(async () => {
        definition = await getLoopDefinition(true);
        let origEmit = definition.emit;
        definition.emit = (...args) => {
          console.log('>>> EMIT: %o', args);
          origEmit(...args);
        };
      });

      it('emits start with task id', (done) => {
        const task = definition.getActivityById('task');
        task.activate();

        nock('http://example.com')
          .get('/api/pal?version=0')
          .delay(50)
          .reply(200, { })
          .get('/api/franz?version=1')
          .delay(30)
          .reply(200, { })
          .get('/api/immanuel?version=2')
          .reply(409, { });

        const starts = [];

        task.broker.subscribe('execution', 'execute.start', null, (eventName, message) => {
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
        }, { noAck: true, consumerTag: uniqueID(), durable: true} );

        task.on('end', () => {
          expect(starts).to.deep.equal(['task', 'task', 'task']);
          done();
        });

        task.run();
      });

      it('emits end when completed', (done) => {
        const task = definition.getActivityById('task');
        task.activate();

        task.broker.subscribe('execution', 'execute.start', null, (eventName, message) => {
          if (message.content.isRootScope) return;

          const input = message.content;
          debug(`/api${input.item}?version=${input.index}`);
          nock('http://example.com')
            .get(`/api${input.item}?version=${input.index}`)
            .reply(input.index < 2 ? 200 : 409, {});
        }, { noAck: true, consumerTag: uniqueID(), durable: true} );

        task.on('end', () => {
          done();
        });

        task.run();
      });

      it('getOutput() returns result from loop', (done) => {
        const task = definition.getActivityById('task');
        task.activate();

        const responses = [
          { statusCode: 200, body: { pal: 'hello I\'m Pal!' } }
          , { statusCode: 200, body: { franz: 'this is Franz!' } }
          , { statusCode: 409, body: { immanuel: 'Immanuel here!' } }
        ];

        task.broker.subscribe('execution', 'execute.start', null, (eventName, message) => {
          if (message.content.isRootScope) return;

          const input = message.content;
          debug(`/api${input.item}?version=${input.index}`);
          nock('http://example.com')
            .get(`/api${input.item}?version=${input.index}`)
            .delay(50 - input.version * 10)
            .reply(responses[input.index].statusCode, responses[input.index].body);
        }, { noAck: true, consumerTag: uniqueID(), durable: true} );

        task.on('end', (executionContext) => {
          const output = executionContext.content.output;
          expect(output).to.deep.equal(responses);
          done();
        });

        task.run();
      });

    });

    describe('parallell', () => {
      let definition;
      beforeEach(async () => {
        definition = await getLoopDefinition(false);
      });

      it('emits start with different ids', (done) => {
        nock('http://example.com')
          .get('/api/pal?version=0')
          .delay(20)
          .reply(200, {})
          .get('/api/franz?version=1')
          .delay(10)
          .reply(200, {})
          .get('/api/immanuel?version=2')
          .reply(409, {});

        const task = definition.getActivityById('task');
        task.activate();

        const starts = [];
        task.broker.subscribe('execution', 'execute.start', null, (eventName, message) => {
          if (message.content.isRootScope) return;

          expect(message.content.id).to.not.be.equal(task.execution.getApi().executionId);
          starts.push(message.content.executionId);
        }, { noAck: true, consumerTag: uniqueID(), durable: true} );

        task.on('end', () => {
          expect(starts.includes(task.id), 'unique task id').to.not.be.ok;
          done();
        });

        task.run();
      });

      it('returns output in sequence', (done) => {
        const task = definition.getActivityById('task');

        const responses = [
          { statusCode: 200, body: { pal: 'hello I\'m Pal!' } }
          , { statusCode: 200, body: { franz: 'this is Franz!' } }
          , { statusCode: 409, body: { immanuel: 'Immanuel here!' } }
        ];

        task.broker.subscribe('execution', 'execute.start', null, (eventName, message) => {
          if (message.content.isRootScope) return;
          const input = message.content;
          const uri = `/api${input.item}?version=${input.index}`;
          debug('>>>> EXECUTE.START: %o response(%o): %o', uri, responses[input.index].statusCode, responses[input.index].body);
          nock('http://example.com')
            .get(uri)
            .delay(500 - input.index * 10)
            .reply(responses[input.index].statusCode, responses[input.index].body);
        }, { noAck: true, consumerTag: uniqueID(), durable: true, priority: 1} );

        task.on('end', (executionContext) => {
          const output = executionContext.content.output;
          debug(executionContext.content.output);
          expect(output).to.deep.equal(responses);

          done();
        });

        task.activate();
        task.run();
      });

      it('getOutput() returns result from loop', (done) => {
        const task = definition.getActivityById('task');
        task.activate();

        const responses = [
          { statusCode: 200, body: { pal: 'hello I\'m Pal!' } }
          , { statusCode: 200, body: { franz: 'this is Franz!' } }
          , { statusCode: 409, body: { immanuel: 'Immanuel here!' } }
        ];
        task.broker.subscribe('execution', 'execute.start', null, (eventName, message) => {
          if (message.content.isRootScope) return;
          const input = message.content;
          nock('http://example.com')
            .get(`/api${input.item}?version=${input.index}`)
            .delay(50 - input.version * 10)
            .reply(responses[input.index].statusCode, responses[input.index].body);
        }, { noAck: true, consumerTag: uniqueID(), durable: true} );

        task.on('end', (executionContext) => {
          // TODO: what getOutput ??
          // add result to task.. so far task does not have output
          done();
        });

        task.run();
      });
    });
  });

});

async function getLoopDefinition(isSequential, listener) {
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
                  <camunda:entry key="uri">http://example.com/api\${path}?version=\${version}</camunda:entry>
                  <camunda:entry key="json">\${true}</camunda:entry>
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
  const definition = await getDefinition(source, camundaExtensions, listener);

  definition.environment.assignVariables({
    paths: ['/pal', '/franz', '/immanuel']
  });
  definition.environment.addService('get', (inputContext, callback) => {
    const data = Object.assign({}, inputContext.variables
      , inputContext.loopArgs
      , inputContext.inputArgs);
    debug(`calling(idx:${data.index},item:${data.item}) ${data.reqOptions.uri}`);
    request.get(data.reqOptions, undefined, (err, res, body) => {
      debug(`(${inputContext.message.content.executionId}) reponse(idx:${data.index},item:${data.item}) ${data.reqOptions.uri}: ${res.statusCode}`);
      callback(err, [ res, body ]);
    });
  });

  return definition;
}
