'use strict';

const camundaExtensions = require('../../../../resources/camunda');
const {getDefinition, debug} = require('../../../helpers/testHelpers');

describe('ScriptTask', () => {
  describe('io', () => {
    it('returns input context if no input parameters', (done) => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="theProcess" isExecutable="true">
          <scriptTask id="ping" name="ping" scriptFormat="Javascript">
            <script>
              <![CDATA[
                next(null, {output: environment.variables.input });
              ]]>
            </script>
            <extensionElements>
              <camunda:inputOutput>
                <camunda:outputParameter name="pinged">\${output}</camunda:outputParameter>
              </camunda:inputOutput>
            </extensionElements>
          </scriptTask>
        </process>
      </definitions>`;

      getDefinition(source, camundaExtensions).then((definition) => {
        definition.environment.assignVariables({input: 2});

        const task = definition.getActivityById('ping');

        task.once('end', (args) => {
          const { content } = args;

          const output = content.output || {};
          expect(output).to.eql({
            output: 2
          });
          done();
        });

        task.run();
      }).catch(done);
    });
  });
});
