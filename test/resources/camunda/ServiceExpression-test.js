'use strict';

const { expect } = require('chai');
const { uniqueID } = require('mocha/lib/utils');
const factory = require('../../helpers/factory');
const { initEngine } = require('../../helpers/testHelpers');

describe('Service expression', () => {
  let engine;
  let definition;
  beforeEach((done) => {
    initEngine(factory.resource('service-task.bpmn')).then(env => {
      definition = env.definition;
      engine = env.engine;
      done();
    });
  });

  it('executes service on taken inbound', (done) => {
    definition.environment.addService('postMessage', (inputContext, next) => {
      next(null, true);
    });

    const task = definition.getActivityById('serviceTask');
    task.activate();

    task.broker.subscribe('execution', 'execute.completed', null, (eventName, message) => {
      expect(message.content.output).to.deep.eql([true]);
    }, { noAck: true, consumerTag: uniqueID(), durable: true});
    task.once('end', (api) => {
      expect(api.content.output).to.deep.eql([true]);
      done();
    });

    task.inbound[0].take();
  });

  it('expression function is called with input context', (done) => {
    definition.environment.addService('postMessage', (message, callback) => {
      definition.logger.debug(message);
      expect(message).to.have.property('variables');
//      expect(message).to.have.property('output');
//      expect(message).to.have.property('services');
      callback();
    });

    engine.execute({}, done);
  });

  it('error in callback caught by bound error event', (done) => {
    definition.environment.addService('postMessage', (message, callback) => {
      callback(new Error('postMessage failed'));
    });

    const task = definition.getActivityById('serviceTask');
    const boundEvent = definition.getActivityById('errorEvent');
    const endInVain = definition.getActivityById('endInVain');
    endInVain.activate();
    boundEvent.activate();
    task.activate();

    task.broker.subscribe('execution', 'execution.error', null, (eventName, message) => {
      const { state, error } = message.content;
      const { type, description } = error;
      expect(state).to.equal('error');
      expect(type).to.equal('ActivityError');
      expect(description).to.equal('postMessage failed');
    }, { noAck: true, consumerTag: uniqueID(), durable: true});
    boundEvent.broker.subscribe('execution', 'execute.completed', null, (eventName, message) => {
      const {id, state, output} = message.content;
      const {type, description} = output;
      expect(id).to.equal('errorEvent');
      expect(state).to.equal('catch');
      expect(type).to.equal('ActivityError');
      expect(description).to.equal('postMessage failed');
    }, { noAck: true, consumerTag: uniqueID(), durable: true});
    endInVain.once('start', () => {
      done();
    });

    task.inbound[0].take();
  });

  it('timeout error in callback', (done) => {
    definition.environment.addService('postMessage', (message, callback) => {
      setTimeout(() => {
        callback(null, 'Post OK');
      }, 1000);
    });

    const task = definition.getActivityById('serviceTask');
    const boundEvent = definition.getActivityById('errorEvent');
    const endInVain = definition.getActivityById('endInVain');
    const timerEvent = definition.getActivityById('timerEvent');
    const timeoutEnd = definition.getActivityById('timeoutEnd');
    endInVain.activate();
    boundEvent.activate();
    task.activate();
    timeoutEnd.activate();
    timerEvent.activate();

    task.broker.subscribe('execution', 'execute.timer', null, (eventName, message) => {
      expect(message.content.state).to.equal('timer');
    }, { noAck: true, consumerTag: uniqueID(), durable: true});

    timerEvent.broker.subscribe('execution', 'execute.completed', null, (eventName, message) => {
      expect(message.content.state).to.equal('timeout');
    }, { noAck: true, consumerTag: uniqueID(), durable: true});
    timeoutEnd.once('start', () => {
      done();
    });

    task.inbound[0].take();
  });
});
