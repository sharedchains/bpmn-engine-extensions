'use strict';

const camundaExtensions = require('../../../resources/camunda');
const { debug } = require('../../helpers/testHelpers');
const EventEmitter2 = require('eventemitter2');
const {Engine} = require('bpmn-engine');
const { assert, expect } = require('chai');

describe('MultiInstanceLoopCharacteristics', () => {
  describe('collection expression', () => {
    it('loops each item', (done) => {
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

      const engine = new Engine({
        source,
        extensions: { camunda: camundaExtensions.extension },
        moddleOptions: { camunda: camundaExtensions.moddleOptions },
      });
      const listener = new EventEmitter2();

      let startCount = 0;
      listener.onAny((event, args) => {
        if (args.content.error) {
          assert.fail(args.content.error.description);
        }
        debug('********************** %o', event);
      });
      listener.on('start-recurring', () => {
        startCount++;
      });

      let sum = 0;
      engine.execute({
        listener,
        services: {
          loop: (executionContext, callback) => {
            debug('loop: %o', executionContext);
            sum += executionContext.item;
            callback(null, sum);
          }
        },
        variables: {
          input: [1, 2, 3, 7]
        }
      });
      //      engine.once('end', () => {
      listener.on('activity.end', (context) => {
        debug('output: %o', context.content.output);
        expect(context.content.output).to.deep.equal([
          [1], [3], [6], [13]
        ]);
        expect(sum, 'sum').to.equal(13);
        debug('> done');
        done();
      });
    });

    it('sets loop item to defined elementVariable', (done) => {
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

      const engine = new Engine({
        source,
        extensions: { camunda: camundaExtensions.extension },
        moddleOptions: { camunda: camundaExtensions.moddleOptions },
      });
      const listener = new EventEmitter2();

      listener.onAny((event, args) => {
        if (args.content.error) {
          debug('>>> ERROR! %o', args.content.error.description);
          assert.fail(args.content.error.description);
        }
        debug('********************** %o', event);
      });

      let sum = 0;
      listener.on('activity.end', (context) => {
        debug(context.content.output);
        expect(sum, 'sum').to.equal(13);
        done();
      });
      engine.execute({
        listener,
        services: {
          loop: (executionContext, callback) => {
            debug('loop: %o', executionContext);
            sum += executionContext.inputVar;
            callback(null, sum);
          }
        },
        variables: {
          input: [1, 2, 3, 7]
        }
      });
      //      engine.once('end', () => {
    });
  });

  it('works in parallel', (done) => {
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

    const engine = new Engine({
      source,
      extensions: { camunda: camundaExtensions.extension },
      moddleOptions: { camunda: camundaExtensions.moddleOptions },
    });

    engine.getDefinitions().then(() => {

      const listener = new EventEmitter2();
      listener.onAny((event, args) => {
        if (args.content.error) {
          debug('>>> ERROR! %o', args.content.error.description);
          assert.fail(args.content.error.description);
        }
      });

      const sum = [];
      listener.on('activity.end', (context) => {
        const output = context.content.output;
        // chai loops endlessly if we do check !!! (why??)
        expect(sum[0][0]).to.equal(output[0][0]);
        expect(sum[1][0]).to.equal(output[1][0]);
        expect(sum[2][0]).to.equal(output[2][0]);
        expect(sum[3][0]).to.equal(output[3][0]);
        expect(sum[4][0]).to.equal(output[4][0]);
        expect(sum[5][0]).to.equal(output[5][0]);
        expect(sum[6][0]).to.equal(output[6][0]);
        expect(sum[7][0]).to.equal(output[7][0]);
        done();
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
      });

    }).catch(error => {
      assert.fail(error);
    });
  });
});
