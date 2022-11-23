'use strict';


const { expect } = require('chai');
const testHelpers = require('../../helpers/testHelpers');

describe('SubProcess', () => {
  describe('IO', () => {
    it('transfers input as environment options', () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
      <bpmn:definitions id="Definitions_1" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
            targetNamespace="http://bpmn.io/schema/bpmn">
        <bpmn:process id="mainProcess" isExecutable="true">
          <bpmn:subProcess id="subProcess" name="Wrapped">
            <bpmn:extensionElements>
              <camunda:inputOutput>
                <camunda:inputParameter name="api">\${environment.variables.apiPath}</camunda:inputParameter>
                <camunda:inputParameter name="serviceFn">\${environment.services.put}</camunda:inputParameter>
                <camunda:outputParameter name="result">\${subServiceTask.result}</camunda:outputParameter>
              </camunda:inputOutput>
            </bpmn:extensionElements>
            <bpmn:serviceTask id="subServiceTask" name="Put" camunda:expression="\${environment.variables.serviceFn}">
              <bpmn:extensionElements>
                <camunda:inputOutput>
                  <camunda:inputParameter name="uri">\${environment.variables.api}</camunda:inputParameter>
                  <camunda:outputParameter name="result">\${result[0]}</camunda:outputParameter>
                </camunda:inputOutput>
              </bpmn:extensionElements>
            </bpmn:serviceTask>
          </bpmn:subProcess>
        </bpmn:process>
      </bpmn:definitions>`;

      return testHelpers.testEngine({ source
        , services: {
          put: ({uri}, next) => {
            if (uri !== 'https://api.example.com/v1') return next(new Error(`Wrong uri ${uri}`));
            // TODO: CHECK no "result default assignment"
            next(null, "1");
          }
        },
        variables: {
          apiPath: 'https://api.example.com/v1'
        }
      }, ({engine, listener, res, rej}) => {
        listener.on('activity.enter', (api) => {
          try {
            if (api.id === 'subProcess') {
              const input = api.owner.getInput();
              expect(input).to.be.ok;
              expect(input).to.have.property('api');
              expect(input.api).to.be.equal('https://api.example.com/v1');
              expect(input).to.have.property('serviceFn');
            }
          } catch (ex) {
            rej(ex);
          }
        });
        listener.on('process.end', ({owner}) => {
          try {
            expect(owner.environment.output).to.deep.equal({
              subProcess: { subServiceTask: { result: '1' }
                , result: '1'
              }
            });
          } catch (ex) {
            rej(ex);
          }
          res();
        });
        engine.execute({ listener }, (err, execution) => {
          if (err) rej(err);
          res();
        });
      });
    });
  });

  describe('subprocess-looped', () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="parallelLoopProcess" isExecutable="true">
    <bpmn:startEvent id="start-event">
      <bpmn:outgoing>flow1</bpmn:outgoing>
    </bpmn:startEvent>

      <bpmn:sequenceFlow id="flow1" sourceRef="start-event" targetRef="sub-process-task" />

      <subProcess id="sub-process-task" name="Wrapped">
        <bpmn:incoming>flow1</bpmn:incoming>
        <bpmn:outgoing>flow3</bpmn:outgoing>
        <multiInstanceLoopCharacteristics isSequential="false"
            camunda:collection="\${environment.variables.inputList}"
            camunda:elementVariable="loopItem">
          <loopCardinality>5</loopCardinality>
        </multiInstanceLoopCharacteristics>
        <extensionElements>
          <camunda:inputOutput>
            <camunda:outputParameter name="result">\${output.result}</camunda:outputParameter>
          </camunda:inputOutput>
        </extensionElements>

        <bpmn:startEvent id="wrapped-start">
          <bpmn:outgoing>wrappedFlow1</bpmn:outgoing>
        </bpmn:startEvent>

        <bpmn:sequenceFlow id="wrappedFlow1" sourceRef="wrapped-start" targetRef="serviceTask" />

        <serviceTask id="serviceTask" name="Put" implementation="\${environment.services.loop}">
          <extensionElements>
            <camunda:inputOutput>
              <camunda:inputParameter name="input">\${environment.variables.prefix} \${environment.variables.content.loopItem}</camunda:inputParameter>
              <camunda:outputParameter name="result">\${result[0]}</camunda:outputParameter>
            </camunda:inputOutput>
          </extensionElements>
          <bpmn:incoming>wrappedFlow1</bpmn:incoming>
          <bpmn:outgoing>wrappedFlow2</bpmn:outgoing>
        </serviceTask>

        <bpmn:sequenceFlow id="wrappedFlow2" sourceRef="serviceTask" targetRef="wrapped-end" />

        <bpmn:endEvent id="wrapped-end">
          <bpmn:incoming>wrappedFlow2</bpmn:incoming>
      </bpmn:endEvent>
      </subProcess>

      <bpmn:sequenceFlow id="flow3" sourceRef="sub-process-task" targetRef="end-event" />

      <bpmn:endEvent id="end-event">
       <bpmn:incoming>flow3</bpmn:incoming>
      </bpmn:endEvent>
      </process>
    </definitions>`;

    let callNo = 0;
    it('transfers loop message as options', () => {
      return testHelpers.testEngine({ source
        , services: {
          loop: (input, next) => {
            next(null, input.content.input.input);
          }
        }
        , variables: {
          prefix: 'sub',
          inputList: ['labour', 'archiving', 'shopping']
        }
        }, ({engine, listener, res, rej }) => {

        listener.on('process.end', ({owner}) => {
          try {
            expect(owner.environment.output).to.deep.equal({
              'sub-process-task': { serviceTask: [
                { result: 'sub labour' }
                , { result: 'sub archiving' }
                , { result: 'sub shopping' }
              ]}
            });
          } catch (ex) {
            rej(ex);
          }
          res();
        });
      engine.execute({ listener }, (err, execution) => {
        if (err) rej(err);
      });

    });
  });
});

});