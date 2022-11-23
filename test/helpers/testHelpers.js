'use strict';

const camunda = require('../../resources/camunda');
const {Engine} = require('bpmn-engine');
const Debug = require('debug');
const { uniqueID } = require('mocha/lib/utils');
const nock = require('nock');
const EventEmitter2 = require('eventemitter2');

Debug.enable('-nock*,bpmn*,test*');
const debug = Debug('test');

const apiHost = 'http://example.com';
const apiPath = '/api';
const apiUrl = apiHost + apiPath;

module.exports = {
  initEngine,
  getEngine,
  getEnvironment,
  getProcess,
  testEngine,
  onceEvent,
  debug,
  debugEngine,
  dumpQueue,
  getNockGet,
  apiUrl,
  apiPath,
  apiHost
};

let scope;
function getNockGet(_apiHost = apiHost, _apiPath = apiPath) {
  if (scope) {
    nock.abortPendingRequests();
    nock.cleanAll();
  }
  scope = nock(_apiHost)
    .defaultReplyHeaders({
      'Content-Type': 'application/json'
    })
    .get(_apiPath);
  return scope;
}


function dumpQueue(state) {
  const queues = state.definitions[0].execution.processes[0].broker.queues;
  queues.forEach(q => {
    const mess = q.messages;
    console.error(q.options);
    mess.forEach(m => {
      const {content: c} = m;
      console.error('%o: %o %o', q.name, c.id, c.state);
    });
  });
}

function getEngine(options = {}) {
  // hack.. hack.. hack...
  if (typeof options === 'string' || options instanceof String) {
    options = { source: options };
  }
  let extensions = { camunda: camunda.extension };
  if (options && options.extensions) {
    extensions = Object.assign({}, extensions, options.extensions );
    delete options.extensions;
  }
  return new Engine(Object.assign({}, {
    extensions,
    moddleOptions: { camunda: camunda.moddleOptions },
    name: 'test-engine'
  },
  options
  ));
}

function debugEvent(source, eventName, eventArgs) {
  debug('----');
  debug(`${source}<${eventName}> on ${eventArgs.id}`);
  debug(eventArgs.content);
  debug('----');
}

function debugEngine({ engineOptions, executeOptions, debugOptions, testCallback, doneCallback}) {
  const engine = getEngine(engineOptions);

  return engine.getDefinitions().then(definitions => {
    const definition = definitions[0];
    executeOptions = executeOptions || {};
    debugOptions = debugOptions || {};

    ['run', 'api', 'event', 'execution'].forEach(what => {
      if (debugOptions.engine) {
        engine.broker.subscribe(what, '#', null, (eventName, message) => {
          const { content } = message;
          debug(`ENGINE:${what}:${eventName} ${content.id}:${content.executionId}`);
        }, { noAck: true, consumerTag: uniqueID(), durable: true, priority: 1000000});
      }
      if (debugOptions.definition) {
        definition.broker.subscribe(what, '#', null, (eventName, message) => {
          const { content } = message;
          debug(`DEFINITION:${what}:${eventName} ${content.id}:${content.executionId}`);
        }, { noAck: true, consumerTag: uniqueID(), durable: true, priority: 100000});
      }
      if (debugOptions.process) {
        definition.getProcesses().forEach(process => {
          process.broker.subscribe(what, '#', null, (eventName, message) => {
            const { content } = message;
            debug(`PROCESS:${what}:${eventName} ${content.id}:${content.executionId}`);
          }, { noAck: true, consumerTag: uniqueID(), durable: true, priority: 100000});

        });
      }
    });

    const listener = executeOptions.listener || new EventEmitter2();

    if (debugOptions.debugAny) {
      listener.onAny((eventName, args) => debugEvent('any', eventName, args));
    }
    if (debugOptions.task) {
      const taskName = Object.keys(debugOptions.task);
      listener.on('activity.enter', (api) => {
        const { content } = api;
        if (taskName && taskName.includes(content.id)) {
          debug(`init debug of ${content.id}`);
          debugOptions.task[content.id].forEach(what => {
            api.broker.subscribe(what, '#', null, (_eventName, _message) => {
              debug('----');
              debug(`event<${_eventName}> on ${content.id}`);
              debug(_message.content);
              debug('----');
            }, { priority: 10000, noAck: true }); //, consumerTag: '_process-run'});
          });
        }
      });
    }


    if (!testCallback) return Promise.resolve(definition);

    executeOptions.listener = executeOptions.listener || listener;
    testCallback({engine, definition, listener});

    return new Promise((res, rej) => {
      engine.execute(executeOptions, (...args) => {
        if (args[0]) rej(args[0]);

        if (!doneCallback) res();

        doneCallback(...args).then(res).catch(err => {
          console.error(err);
          rej(err);
        });
      });
    });
  });
}

function getEnvironment(options = {}) {
  const engine = getEngine(options);
  return engine.environment;
}

function getProcess(state, processId=null) {
  expect(state.definitions).to.be.ok;
  let process = state.definitions[0].execution.processes[0];
  if (processId) process = state.definitions[0].execution.processes.find(_process => _process.id === processId);
  expect(process).to.be.ok;
  expect(process.execution.children).to.be.ok;
  process.getChildren = function(childId) {
    expect(process.execution).to.be.ok;
    expect(process.execution.children).to.be.ok;
    return process.execution.children.find(child => child.id === childId);
  };
  return process;
}

function initEngine(options = {}) {
  const engine = getEngine(options);
  const listener = new EventEmitter2();
  return new Promise((res, rej) => {
    engine.getDefinitions().then(definitions => {
      res({ definition: definitions[0], engine, listener });
    }).catch(rej);
  });
}

function testEngine(options = {}, testFn) {
  const engine = getEngine(options);
  const listener = new EventEmitter2();
  return new Promise((res, rej) => {
    engine.getDefinitions().then(definitions => {
      testFn({ definition: definitions[0]
        , engine
        , listener
        , res
        , rej
      });
    });
  });
}


function onceEvent(emitter, eventName) {
  return new Promise((resolve) => {
    emitter.once(eventName, (...args) => {
      resolve(...args);
    });
  });
}
