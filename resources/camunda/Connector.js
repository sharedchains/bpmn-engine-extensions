'use strict';

const Debug = require('debug');
const Parameter = require('./Parameter');
const getNormalizedResult = require('./getNormalizedResult');

module.exports = function Connector(connector, activityElement, parentContext) {
  const type = connector.$type;
  const name = connector.connectorId;
  const {environment} = parentContext;
  const debug = Debug(`bpmn-engine:${type.toLowerCase()}`);

  let inputParameters, outputParameters;

  debug('******* connector: %o', connector);
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
  debug(`**Connector** <${name}> type`, type);

  return {
    name,
    type,
    activate,
    deactivate
  };

  function deactivate(..._args) {
    debug('deactivated');
  }

  function activate(parentApi, inputContext) {
    let iParms, oParms;
    const {id: activityId} = parentApi;
    const {isLoopContext, index} = inputContext;

    debug('inputContext: %o', inputContext);
    debug(`<${activityId}> service${isLoopContext ? ` loop context iteration ${index}` : ''} activated`);

   return {
      name,
      type,
      execute
    };

    function execute(message, callback) {
      const inputArgs = getInputArguments(message);
      const loopArgs = getLoopArguments(message);
      const executeArgs = [];
      executeArgs.push({
        activityElement: activityElement
        , inputArgs
        , loopArgs
        , parentContext
      });
      executeArgs.push(serviceCallback);
      debug(`<${name}> execute with`, executeArgs);


      const serviceFn = environment.getServiceByName(name);
      debug('has serviceFn ? %o', (serviceFn ? serviceFn : 'nada'));
      return serviceFn.apply(parentApi, executeArgs);

      function serviceCallback(err, ...args) {
        const output = getOutput(args);

        debug('** OUTPUT: %o', output);
        if (err) {
          debug(`<${name}> errored: ${err.message}`);
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

    function getInputArguments(_message) {
      debug('getInputArguments: %o', inputParameters);
      if (inputParameters)
      {
        const inputArgs = {};
        getInputParameters().map((parm) =>
        {
          inputArgs[parm.name] = parm.get();
        });
        return inputArgs;
      }

      return [inputContext];
    }

    function getOutput(result) {
      if (!outputParameters) return result;

      const resolveResult = getNormalizedResult(result);
      return getOutputParameters().reduce((output, parm, idx) => {
        if (parm.valueType === 'expression') {
          output[parm.name] = parm.resolve(resolveResult);
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
      return oParms;
    }
  }

  function formatParameter(parm) {
    return Parameter(Object.assign({ positional: true}, parm), environment);
  }
};
