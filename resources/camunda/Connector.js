'use strict';

const Debug = require('debug');
const Parameter = require('./Parameter');
const getNormalizedResult = require('./getNormalizedResult');

module.exports = function Connector(connector, activityElement, parentContext) {
  const type = connector.$type;
  const name = connector.connectorId;
  const id = connector.connectorId;
  const {environment} = parentContext;
  const connectorActivityElement = activityElement;
  const debug = Debug(`bpmn-engine:${type.toLowerCase()}:${id}`);

  let inputParameters, outputParameters;

  debug('>>> START: connector: %o', connector);
  if (connector.inputOutput) {
    if (connector.inputOutput.inputParameters) {
      inputParameters = connector.inputOutput.inputParameters.map(formatParameter);
    }
    if (connector.inputOutput.outputParameters) {
      outputParameters = connector.inputOutput.outputParameters.map(formatParameter);
    }
  }
  debug('INPUT: %o', inputParameters);
  debug('OUTPUT: %o', outputParameters);
  debug(`<<< DONE: connector: <${name}> type`, type);

  return {
    name,
    type,
    id: name,
    activate,
    deactivate
  };

  function deactivate() {
    debug('deactivated');
  }

  function activate(parentApi, inputContext) {
    let iParms, oParms;
    let activityId = 'unknown';
    let parentType = 'unknown';

    if (parentApi.id) activityId = parentApi.id;
    else if (parentApi.content.id) activityId = parentApi.content.id;

    if (parentApi.type) parentType = parentApi.type;
    else if (parentApi.content.type) parentType = parentApi.content.type;

    const {isLoopContext, index} = inputContext;

    debug('>>> Activate - type: %o parentApi: %o', parentType, parentApi);
    debug('>>> Activate: %o - inputContext: %o', activityId, inputContext);
    debug(`<${activityId}> service${isLoopContext ? ` loop context iteration ${index}` : ''} activated`);
    if (parentType === 'bpmn:IntermediateThrowEvent') {
      debug('>>> Activate: connector: %o', connector);
      debug('>>> Activate: activity: %o', connectorActivityElement);
      debug('>>> Activate: environment: %o', environment);
      const orig = connectorActivityElement.eventDefinitions[0].execute;
      connectorActivityElement.eventDefinitions[0].execute = function(executeMessage) {
        execute(executeMessage, orig);
      };
    }

   return {
      name,
      type: parentType,
      execute
    };

    function execute(message, callback) {
      const inputArgs = getInputArguments();
      const loopArgs = getLoopArguments(message);
      const executeArgs = [];
      executeArgs.push({
        activityElement: connectorActivityElement
        , inputArgs
        , loopArgs
        , parentContext
        , message
        , connector
      });
      executeArgs.push(serviceCallback);
      debug(`<${name}> execute with`, executeArgs);


      const serviceFn = environment.getServiceByName(name);
      debug('%o has serviceFn ? %o', name, (serviceFn ? 'yes' : 'nada'));
      if (serviceFn === null) {
        // eslint-disable-next-line no-console
        console.warn('>> %o/%o MISSING ServiceFn', id, name);
        return;
      }
      return serviceFn.apply(parentApi, executeArgs);

      function serviceCallback(err, args) {
        debug('<serviceCallback> args: %o', args);
        const output = getOutput(args);

        debug('** OUTPUT: %o', output);
        if (err) {
          debug('error: %o', err);
          debug(`<${name}> error: ` + (err.message ? err.message : 'no error message'));
        } else {
          debug(`<${name}> completed`);
        }

        return callback(err, output);
      }
    }

    function getLoopArguments(message) {
      debug('getInputArgs msg: %o', message);
      const { content } = message;
      if (!content.isMultiInstance)
      {
        return null;
      }

      return { index: content.index
        , item: content.item
        , loopCardinality: content.item };
    }

    function getInputArguments() {
      debug('getInputArguments: %o', inputParameters);
      if (inputParameters) {
        const inputArgs = {};
        getInputParameters().map((parm) => {
          inputArgs[parm.name] = parm.get();
        });
        return inputArgs;
      }

      return [inputContext];
    }

    function getOutput(result) {
      if (result === null) return null;

      if (!outputParameters) return result;

      debug('getOutput - result: %o', result);
      const resolveResult = getNormalizedResult(result);
      debug('getOutput - normalized: %o', resolveResult);

      return getOutputParameters().reduce((output, parm, idx) => {
        debug('getOutput - reduce - output: %o parm: %o  idx: %o', output, parm, idx);
        if (parm.valueType === 'expression') {
          output[parm.name] = parm.resolve(resolveResult);
        } else if (parm.valueType === 'named') {
          /*
          TODO: FIXME... ora questo risolverebbe tutto...
          parm.set(resolveResult);
          parm.save();
          */
          output[parm.name] = result;
        } else {
          output[parm.name] = result[idx];
        }
        return output;
      }, {});
    }

    function getInputParameters() {
      if (iParms) return iParms;
      if (!inputParameters) return [];
      iParms = inputParameters.map((parm) => parm.activate(inputContext));
      debug('getInputParameters return: %o', iParms);
      return iParms;
    }

    function getOutputParameters(reassign) {
      if (!outputParameters) return [];
      if (!reassign && oParms) return oParms;
      oParms = outputParameters.map((parm) => parm.activate(inputContext));
      debug('getOutputParameters return: %o', oParms);
      return oParms;
    }
  }

  function formatParameter(parm) {
    return Parameter(Object.assign({ positional: true}, parm), environment);
  }
};
