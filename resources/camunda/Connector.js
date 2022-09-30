'use strict';

const Debug = require('debug');
const Parameter = require('./Parameter');
const getNormalizedResult = require('./getNormalizedResult');

module.exports = function Connector(connector, activityElement, parentContext) {
  const type = connector.$type;
  const name = connector.connectorId;
  const id = connector.connectorId;
  const {environment} = parentContext;
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
    // populated by getInputArguments() and getOutputArguments()
    let iParms, oParms;
    let activityId = 'unknown';
    let parentType = 'unknown';

    debug('================ activateConnector: %o', inputContext);
    if (parentApi.id) activityId = parentApi.id;
    else if (parentApi.content.id) activityId = parentApi.content.id;

    if (parentApi.type) parentType = parentApi.type;
    else if (parentApi.content.type) parentType = parentApi.content.type;

    const {isLoopContext, index} = inputContext.content;

    debug('>>> Activate %o - type: %o', activityId, parentType);
    debug(`<${activityId}> service${isLoopContext ? ` loop context iteration ${index}` : ''} activated`);

    if (parentType === 'bpmn:IntermediateThrowEvent') {
      debug('>>> Activate: connector: %o', connector);
      debug('>>> Activate: activity: %o', activityElement);
      debug('>>> Activate: environment: %o', environment);
      const origCallback = activityElement.eventDefinitions[0].execute;
      activityElement.eventDefinitions[0].execute = (executeMessage) => {
        execute(executeMessage, origCallback);
      };
    }

    return {
      name,
      type: parentType,
      execute,
      setInputContext
    };

    function setInputContext(newContext) {
      inputContext = newContext;
    }

    function execute(message, callback) {
      const inputArgs = getInputArguments();
      const loopArgs = getLoopArguments(message);
      debug('execute inputArgs: %o', inputArgs);
      debug('execute loopArgs: %o', loopArgs);
      const executeArgs = [];
      executeArgs.push({
        inputArgs
        , loopArgs
        , parentContext
        , message
        , connector
        , variables: parentContext.environment.variables
      });
      executeArgs.push(serviceCallback);

      const serviceFn = environment.getServiceByName(name);
      debug('%o has serviceFn ? %o', name, (serviceFn ? 'yes' : 'nada'));
      if (serviceFn === null) {
        // eslint-disable-next-line no-console
        console.warn('>> %o/%o MISSING ServiceFn', id, name);
        return callback('Missing service function', null);
      }
      return serviceFn.apply(parentApi, executeArgs);

      function serviceCallback(err, args) {
        let x = getNormalizedResult(args || {});
        setInputContext(Object.assign({},
            inputContext
            , x
            , { variables: x }));
        const output = getOutput(args);
          debug('aftercallback GOT: %o', output);
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
      debug('getLoopArgs msg: %o', message);
      const { content } = message;
      if (!content.isMultiInstance) {
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

      const resolveResult = getNormalizedResult(result);
      if (!outputParameters) return resolveResult;

      const outputParms = getOutputParameters(isLoopContext);
      if (outputParameters.length === 0) {
        Object.keys(resolveResult).forEach(key => {
          environment.assignVariables(key, resolveResult[key]);
        });
        return resolveResult;
      }
      if (outputParms.length === 1) {
        const parm = outputParms[0];
        parm.set(parm.get()
          || resolveResult[parm.name] || result);
        parm.save();
        return { [parm.name]: parm.get() };
      }
      const reduced = {};
      outputParms.reduce((output, parm, idx) => {
        debug('getOutput - reduce - parm: %o  idx: %o - value: %o', parm, idx, parm.get());
//        parm.set(resolveResult[parm.name]);
//        parm.save();
        reduced[parm.name] = parm.get();
        return { [parm.name]: parm.get() };
      }, {});
        return reduced;
    }

    function getInputParameters() {
      debug('************************* getInputParameters: ctx: %o has iParms?%o isLoop?%o ', inputContext, iParms?'Y':'N', isLoopContext?'Y':'N');
      if (iParms && !isLoopContext) return iParms;
      if (!inputParameters) return [];
      iParms = inputParameters.map((parm) => parm.activate(inputContext));
      iParms.forEach(parm => {
        debug('getInputArguments: %o: %o', parm.name, parm.get());
      });
      return iParms;
    }

    function getOutputParameters(reassign) {
      debug('************************* getOutputParameters: ctx: %o has iParms?%o isLoop?%o reassing?%o', inputContext
        , oParms?'Y':'N', isLoopContext?'Y':'N', reassign?'Y':'N');
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
