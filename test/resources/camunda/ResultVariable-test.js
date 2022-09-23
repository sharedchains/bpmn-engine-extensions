'use strict';

const camundaExtensions = require('../../../resources/camunda');
const {EventEmitter} = require('events');
const {getDefinition} = require('../../helpers/testHelpers');
const debug = require('debug');
debug.enable('*');

describe('Result variable', () => {
  let definition;
  const listener = new EventEmitter();
  beforeEach(async () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <serviceTask id="serviceTask" name="Get" camunda:expression="\${environment.services.getService()}" camunda:resultVariable="taskOutput" />
      </process>
    </definitions>`;
    definition = await getDefinition(source, camundaExtensions, listener);
  });

  it('ServiceTask with resultVariable is stored as output', (done) => {
    definition.environment.addService('getService', () => {
      return function serviceFn(inputContext, callback) {
        callback(null, inputContext.variables.input, 'success');
      };
    });
    definition.environment.assignVariables({input: 1});

    const task = definition.getActivityById('serviceTask');

    listener.on('end', (...args) => {
      debug('QUI %o', args);
//      expect(activityApi.getOutput()).to.eql([1, 'success']);
    });

    definition.on('end', (...args) => {
      const outputValues = task.behaviour.io.getOutput();
      expect(outputValues).to.eql({taskOutput: [1, 'success']});
      done();
    });

    definition.run();
  });
});
