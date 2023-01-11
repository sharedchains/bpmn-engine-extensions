/* eslint-disable no-mixed-spaces-and-tabs */
'use strict';

const factory = require('../../helpers/factory');
const { testEngine } = require('../../helpers/testHelpers');




describe('EventTest', () => {
  it('sends and receives messages', () => {
    return testEngine({
      source: factory.resource('EventTest.bpmn')
	  , services: {
        sendIt: (context, callback) => {
          console.log('>>> SENDIT: %O', context);
          callback(null, { 'sendIt': 'some output' });
        }
        , ActivityReceiveTask: (context, callback) => {
          console.log('>>>> ACTIVITY RECEIVE TASK');
          callback(null, { 'recTask': 'some output' });
        }
        , ActivitySendTask: function (context, callback) {
          console.log('>>>> ACTIVITY SEND TASK: %O', this);
		  try {
            this.throwMessage('Message1to2');
            callback(null, { 'sndTask': 'some task output' });
          } catch (e) {
            callback(e, null);
          }
        }
	  }
    }, ({ engine, listener, res, rej }) => {
		/*
      listener.onAny((event, api) => {
        console.log('==== %O<%o>', event, api ? api.id : '<noapi>');
        console.log('%O message: %O', event, api ? api.content : '<nocontent>');
        console.log('%O variables: %O', event, api ? api.environment.variables : '<novars>');
        console.log('===================');
      });
	  */
	  listener.on('activity.error', (_event, api) => {
        rej(api.content);
	  });
      engine.execute({
        listener
      }, (error) => {
        if (error) rej(error);
        res();
      });
    });
  });
});
