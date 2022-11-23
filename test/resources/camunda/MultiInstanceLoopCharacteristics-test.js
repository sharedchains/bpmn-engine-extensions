'use strict';

const { debug, testEngine } = require('../../helpers/testHelpers');

describe('MultiInstanceLoopCharacteristics', () => {
  describe('collection expression', () => {
    it('loops each item', () => {
      const source = `
      <bpmn:definitions id="Definitions_1" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" targetNamespace="http://bpmn.io/schema/bpmn">
        <bpmn:process id="Process_1" isExecutable="true">
          <bpmn:serviceTask id="recurring" name="Each item" camunda:expression="\${environment.services.loop}">
            <bpmn:multiInstanceLoopCharacteristics isSequential="true" camunda:collection="\${environment.variables.input}" />
            <bpmn:extensionElements>
              <camunda:inputOutput>
                <camunda:inputParameter name="item">\${item}</camunda:inputParameter>
                <camunda:inputParameter name="sum">\${item}</camunda:inputParameter>
                <camunda:outputParameter name="sum">\${result[-1][0]}</camunda:outputParameter>
              </camunda:inputOutput>
            </bpmn:extensionElements>
          </bpmn:serviceTask>
        </bpmn:process>
      </bpmn:definitions>`;

      return testEngine({ source, variables: {
        input: [1, 2, 3, 7]
      }}, ({ engine, listener, res, rej}) => {
        let sum = 0;
        let count = 0;

        listener.on('activity.start', (api) => {
          if (api.id !== 'recurring') return;

          api.broker.subscribeTmp('execution', 'execute.iteration.next', () => {
            count++;
          }, { priority: 10000, noAck: true });
        });
        listener.on('activity.end', (context) => {
          try {
            expect(count).to.be.equal(4);
            expect(context.content.output).to.deep.equal([
              [1], [3], [6], [13]
            ]);
            expect(sum, 'sum').to.equal(13);
            res();
          } catch (ex) {
            rej(ex);
          }
        });
        engine.execute({
          listener,
          services: {
            loop: (executionContext, callback) => {
              debug('loop: %o', executionContext);
              sum += executionContext.item;
              callback(null, sum);
            }
          },
        }, (err) => {
          rej(err);
        });
      });
    });

    it('sets loop item to defined elementVariable', () => {
      const source = `
      <bpmn:definitions id="Definitions_1" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" targetNamespace="http://bpmn.io/schema/bpmn">
        <bpmn:process id="Process_1" isExecutable="true">
          <bpmn:serviceTask id="recurring" name="Each item" camunda:expression="\${environment.services.loop}">
            <bpmn:multiInstanceLoopCharacteristics isSequential="true" camunda:collection="\${environment.variables.input}" camunda:elementVariable="inputVar" />
            <bpmn:extensionElements>
              <camunda:inputOutput>
                <camunda:inputParameter name="item">\${inputVar}</camunda:inputParameter>
                <camunda:inputParameter name="sum">\${inputVar}</camunda:inputParameter>
                <camunda:outputParameter name="sum">\${result[-1][0]}</camunda:outputParameter>
              </camunda:inputOutput>
            </bpmn:extensionElements>
          </bpmn:serviceTask>
        </bpmn:process>
      </bpmn:definitions>`;

      return testEngine({ source, variables: {
        input: [1, 2, 3, 7]
      }}, ({ engine, listener, res, rej}) => {

        let sum = 0;
        listener.on('activity.end', () => {
          try {
            expect(sum, 'sum').to.equal(13);
            res();
          } catch (ex) {
            rej(ex);
          }
        });
        engine.execute({
          listener,
          services: {
            loop: (executionContext, callback) => {
              debug('loop: %o', executionContext);
              sum += executionContext.inputVar;
              callback(null, sum);
            }
          }
        }, (err) => {
          rej(err);
        });
      });
    });
  });

  it('works in parallel', () => {
    const source = `
    <bpmn:definitions id="Definitions_1" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" targetNamespace="http://bpmn.io/schema/bpmn">
      <bpmn:process id="mrProcess" isExecutable="true">
        <bpmn:serviceTask id="mrTask" name="in parallel" camunda:expression="\${environment.services.loop}" camunda:resultVariable="MrResult">
          <bpmn:multiInstanceLoopCharacteristics isSequential="false" camunda:collection="\${environment.variables.mrList}" camunda:elementVariable="mrItem" />
          <bpmn:extensionElements>
            <camunda:inputOutput>
              <camunda:inputParameter name="item">\${mrItem}</camunda:inputParameter>
              <camunda:inputParameter name="mrParameter">index:\${index}#item:\${mrItem}</camunda:inputParameter>
              <camunda:outputParameter name="mrOutput">\${output}</camunda:outputParameter>
            </camunda:inputOutput>
          </bpmn:extensionElements>
        </bpmn:serviceTask>
      </bpmn:process>
    </bpmn:definitions>`;

    return testEngine({ source, variables: {
      input: [1, 2, 3, 7]
    }}, ({ engine, listener, res, rej}) => {

      const sum = [];
      listener.on('activity.end', (context) => {
        try {
          const output = context.content.output;
          expect(sum).to.deep.equal(output);
          res();
        } catch (ex) {
          rej(ex);
        }
      });
      engine.execute({
        listener,
        services: {
          loop: (executionContext, callback) => {
            const value = executionContext.mrItem * 2;
            sum[executionContext.index] = [ value ];
            callback(null, value);
          }
        },
        variables: {
          mrList: [1, 1, 2, 3, 5, 8, 13, 21]
        }
      }, (err) => {
        if (err) rej(err);
        rej('should not be here');
      });

    });
  });
});
