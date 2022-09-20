'use strict';

const Parameter = require('../../../resources/camunda/Parameter');
const camundaExtensions = require('../../../resources/camunda');
const {Engine} = require('bpmn-engine');

describe('Parameter', () => {
  const engine = new Engine({
    source: null,
    extensions: { camunda: camundaExtensions.extension },
    moddleOptions: { camunda: camundaExtensions.moddleOptions },
    variables: {
      arbval: 37
    }
  });
  describe('list', () => {
    it('input returns array', (done) => {
      const parm = Parameter({
        $type: 'camunda:inputParameter',
        name: 'list',
        definition: {
          $type: 'camunda:list',
          items: [{
            value: '${listing}'
          }]
        }
      }, {
        resolveExpression: function(expr) {
          if (expr === '${listing}') return 1;
        }
      });

      expect(parm.activate({
        listing: 1
      }).get()).to.eql([1]);

      done();
    });

    it('input returns named value if no items are supplied', (done) => {
      const parm = Parameter({
        $type: 'camunda:inputParameter',
        name: 'listing',
        definition: {
          $type: 'camunda:list'
        }
      }, engine.environment);

      expect(parm.activate({listing: 1}).get()).to.equal(1);

      done();
    });
  });

  describe('map', () => {
    it('returns object', (done) => {
      const parm = Parameter({
        $type: 'camunda:inputParameter',
        name: 'map',
        definition: {
          $type: 'camunda:map',
          entries: [{
            key: 'value',
            value: '${listing}'
          }]
        }
      }, {
        resolveExpression: function(expr) {
          if (expr === '${listing}') return 1;
        }
      });

      expect(parm.activate({listing: 1}).get()).to.eql({value: 1});

      done();
    });

    it('returns named value if no entries are supplied', (done) => {
      const parm = Parameter({
        $type: 'camunda:inputParameter',
        name: 'listing',
        definition: {
          $type: 'camunda:map'
        }
      }, {});

      expect(parm.activate({listing: 1}).get()).to.equal(1);

      done();
    });
  });
});
