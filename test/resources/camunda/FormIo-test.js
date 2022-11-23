'use strict';

const { testEngine } = require('../../helpers/testHelpers');

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


    it('assigns form output to environment if not other io', () => {
      return testEngine(source, env => {
        const { listener, engine, res, rej } = env;
        listener.on('wait', (context, api) => {
          try {
            const task = api.getActivityById(context.id);
            task.getForm().setFieldValue('input', 2);
            engine.logger.debug(task.getForm().getField('input'));
            task.getApi().signal();
          } catch (ex) {
            rej(ex);
          }
        });
        listener.on('activity.end', (context, api) => {
          try {
            const task = api.getActivityById(context.id);
            const output = task.getOutput();
            expect(output).to.deep.equal({ input: 2 });
            res();
          } catch (ex) {
            rej(ex);
          }
        });
        engine.execute({listener});
      });
    });
  });
});
