'use strict';

const Parameter = require('./Parameter');
const getNormalizedResult = require('./getNormalizedResult');

function Connector(source, activityElement) {
  const id = source.connectorId;
  const type = source.$type;
  const name = source.connectorId;
  const environment = activityElement.environment;
  const debug = environment.Logger(`${type}:${id}`).debug;

  let _inputParameters, _outputParameters;

  debug('>>> START: connector: %o', id);
  if (source.inputOutput) {
    if (source.inputOutput.inputParameters) {
      _inputParameters = source.inputOutput.inputParameters.map(formatParameter);
    }
    if (source.inputOutput.outputParameters) {
      _outputParameters = source.inputOutput.outputParameters.map(formatParameter);
    }
  }
  debug('(connector)INPUT: %o', _inputParameters);
  debug('(connector)OUTPUT: %o', _outputParameters);

  debug(`<<< DONE: connector: <${name}> type ${type}`);

  function formatParameter(parm) {
    return Parameter(Object.assign({ positional: true}, parm), environment);
  }

  const connector = function(_activityElement, inputContext) {
    this.activityElement = _activityElement;
    this.environment = _activityElement.environment;
    this.id = source.connectorId;
    this.type = source.$type;
    this.name = source.connectorId;
    this.inputParameters = _inputParameters;
    this.outputParameters = _outputParameters;
    debug('INPUT: %o', this.inputParameters);
    debug('OUTPUT: %o', _outputParameters);

    // populated by getInputArguments() and getOutputArguments()
    this.iParms = null;
    this.oParms = null;

    this.isLoopContext = inputContext.content.isMultiInstance;
    this.index = inputContext.content.index;
    this.inputContext = inputContext;

    console.log(inputContext);

    debug('>>> Activate %o - type: %o', _activityElement.id, _activityElement.type);
    debug(`<${_activityElement.id}> service${this.isLoopContext ? ` loop context iteration ${this.index}` : ''} activated`);

    /*
  TODO:
  if (parentType === 'bpmn:IntermediateThrowEvent') {
    debug('>>> Activate: activity: %o', this.activityElement);
    debug('>>> Activate: environment: %o', environment);
    const origCallback = activityElement.eventDefinitions[0].execute;
    activityElement.eventDefinitions[0].execute = (executeMessage) => {
      this.execute(executeMessage, origCallback);
    };
  }
  */

    this.setInputContext = function setInputContext(newContext) {
      this.inputContext = newContext;
    };

    this.execute = function execute(message, callback) {
      const inputArgs = this.getInputArguments();
      const loopArgs = this.getLoopArguments(message);
      const executeArgs = [];
      executeArgs.push({
        variables: {
          ...this.activityElement.environment.variables
          , ...inputArgs
        }
        , inputArgs
        , loopArgs
        , message
      });

      console.log('+++++ execute args: %o', executeArgs);
      const serviceCallback = (err, args) => {
        debug('aftercallback args: %o', (args || {}));
        if (err) {
          debug('error: %o', err);
          debug(`<${this.name}> error: ` + (err.message ? err.message : 'no error message'));
          return callback(err, null);
        }
        const output = this.getOutput(args || {});
        console.log('**************************** aftercallback OUTPUT: %o', output);
        let io = this.activityElement.behaviour.io;
        if (io) {
          if (io.activate) io = io.activate(this.activityElement, this.inputContext);
          console.log('++++++++++++++++++++++++++ setRESULT');
          io.setResult(output);
          console.log('**************************** aftercallback ACT-OUTPUT: %o', io.getOutput());
        }
        debug(`<${this.name}> completed`);

        return callback(err, output);
      }
      executeArgs.push(serviceCallback);

      const serviceFn = this.environment.getServiceByName(this.name);
      debug('%o has serviceFn ? %o', this.name, (serviceFn ? 'yes' : 'nada'));
      if (serviceFn === null) {
        // eslint-disable-next-line no-console
        console.warn('>> %o/%o MISSING ServiceFn', this.id, this.name);
        return callback('Missing service function', null);
      }
      try
      {
        console.error('============================================================== CALL SERVICEFN');
        let res = serviceFn.apply(this.parentApi, executeArgs);
        if (res!==undefined) {
          console.log('SERVICEFN - result: %o', res);
          serviceCallback(null, res);
        }
        console.error('============================================================== END OF SERVICEFN');
      } catch(err) {
        console.error('============================================================== ERR SERVICEFN');
        serviceCallback(err, null);
      }

    };

    this.getLoopArguments = function getLoopArguments(message) {
      debug('getLoopArgs msg: %o', message);
      const { content } = message;
      if (!content.isMultiInstance) {
        return null;
      }

      return { index: content.index
        , item: content.item
        , loopCardinality: content.loopCardinality };
    };

    this.getInputArguments = function getInputArguments() {
      debug('getInputArguments: %o', this.inputParameters);
      if (this.inputParameters) {
        const inputArgs = {};
        this.getInputParameters().map((parm) => {
          inputArgs[parm.name] = parm.get();
        });
        return inputArgs;
      }

      let { io } = this.activityElement.behaviour;
      if (io) {
        if (io.activate) io = io.activate(this.activityElement, this.inputContext);
        return io.getInput();
      }
      return {};
    };

    this.getOutput = function getOutput(result) {
      console.log('+++++++ connector getOutput: %o', result);
      if (result === null) return null;

      const resolveResult = getNormalizedResult(result);
      console.log('+++++++ getOutput resolveResult: %o', resolveResult);
      console.log('+++++++ getOutput _outputParameters: %o', _outputParameters);
      if (!_outputParameters) return resolveResult;

      const outputParms = this.getOutputParameters(this.isLoopContext);
      if (_outputParameters.length === 0) {
        Object.keys(resolveResult).forEach(key => {
          this.environment.assignVariables(key, resolveResult[key]);
        });
        console.log('+++++++ connector getOutput resolveResult: %o', resolveResult);
        return resolveResult;
      }
      const reduced = {};
      console.log('+++++++ connector getOutput params: %o', outputParms);
      console.log('+++++++ getOutput resolveResult: %o', resolveResult);
      outputParms.reduce((_output, parm, idx) => {
        reduced[parm.name] = parm.resolve(resolveResult);
//        this.environment.assignVariables(parm.name, reduced[parm.name]);
        debug('getOutput - reduce - parm: %o  idx: %o - value: %o', parm, idx, reduced[parm.name]);
//        parm.save();
      }, {});
      console.log('+++++++ connector getOutput reduced: %o', reduced);
      return reduced;
    };

    this.getInputParameters = function getInputParameters() {
      let iContext = { ...this.inputContext }

      let io = this.activityElement.behaviour.io;
      if (io) {
        if (io.activate) io = io.activate(this.activityElement, this.inputContext);
        console.error('>>>> INPUT-CTX: %o', this.inputContext);
        console.error('>>>> INPUT-IO: %o', io.getInput());
        iContext = { ...iContext, ...io.getInput()};
      }
      debug('************************* getInputParameters: ctx: %o has iParms?%o isLoop?%o ', iContext, this.iParms?'Y':'N', this.isLoopContext?'Y':'N');
      console.error(iContext);
      if (this.iParms && !this.isLoopContext) return this.iParms;
      if (!this.inputParameters) return [];
      this.iParms = this.inputParameters.map((parm) => parm.activate(iContext));
      return this.iParms;
    };

    this.getOutputParameters = function getOutputParameters(reassign) {
      debug('************************* getOutputParameters: ctx: %o has iParms?%o isLoop?%o reassing?%o', this.inputContext
        , this.oParms?'Y':'N', this.isLoopContext?'Y':'N', reassign?'Y':'N');

      let iContext = { ...this.inputContext }

      let io = this.activityElement.behaviour.io;
      if (io) {
        if (io.activate) io = io.activate(this.activityElement, this.inputContext);
        console.error('>>>> OUTPUT-CTX: %o', this.inputContext);
        console.error('>>>> OUTPUT-IO: %o', io.getOutput());
        iContext = { ...iContext, ...io.getOutput()};
      }
      if (!reassign && this.oParms) return this.oParms;
      this.oParms = _outputParameters.map((parm) => parm.activate(iContext));
      debug('getOutputParameters return: %o', this.oParms);
      return this.oParms;
    };
  };

  return connector;
}

module.exports = Connector;
