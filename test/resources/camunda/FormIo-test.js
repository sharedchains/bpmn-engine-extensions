'use strict';

const {camunda} = require('../../../resources');
const EventEmitter2 = require('eventemitter2');
const {getEngine} = require('../../helpers/testHelpers');
const { expect } = require('chai');

describe('Form Io', () => {
  describe('behaviour', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <userTask id="task2">
          <extensionElements>
            <camunda:formData>
              <camunda:formField id="input" label="\${environment.variables.label}" />
            </camunda:formData>
          </extensionElements>
        </userTask>
      </process>
    </definitions>`;

    let engine;
    beforeEach(() => {
      engine = getEngine(source, camunda);
    });

    it('assigns form output to environment if not other io', (done) => {
      const listener = new EventEmitter2();
      listener.on('wait', (context, api) => {
        const task = api.getActivityById(context.id);
        task.behaviour.io.getForm().setFieldValue('input', 2);
        engine.logger.debug(task.behaviour.io.getForm().getField('input'));
        task.getApi().signal();
      });
      listener.on('activity.end', (context, api) => {
        const task = api.getActivityById(context.id);
        const output = task.behaviour.io.getOutput();
        expect(output).to.deep.equal({ input: 2 });
        done();
      });
      engine.execute({listener});
    });
  });
});
