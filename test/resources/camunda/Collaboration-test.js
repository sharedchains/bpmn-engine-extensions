'use strict';

const factory = require('../../helpers/factory');
const {testEngine} = require('../../helpers/testHelpers');


describe('Collaboration', () => {
  describe('basetest', () => {
    it('runs..', () => {
      return testEngine({ source: factory.resource('collaboration-1.bpmn'),
      },
      ({engine, listener, res, rej}) => {
        listener.onAny((eventName, api) => {
          console.error('+++++++++++ %o<%o>', eventName, api.id);
          if (api.message) console.error('%o', api.message);
        });
        engine.execute({ listener }, (err, execution) => {
          if (err) rej(err);
          res();
        });
      });

    });
  });
});
