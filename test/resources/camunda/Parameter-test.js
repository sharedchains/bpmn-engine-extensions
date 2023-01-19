'use strict';

const Parameter = require('../../../resources/camunda/Parameter');
const {getEngine, fakeEngine} = require('../../helpers/testHelpers');

describe('Parameter', () => {
  let engine;
  before((done) => {
    engine = getEngine({ variables: {
      arbval: 37
    }});
    done();
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
      }, fakeEngine({ expressions: {
        resolveExpression: function(expr) {
          if (expr === '${listing}') return 1;
        }}
      }));

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
          $type: 'camunda:named',
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
      }, fakeEngine({ expressions: {
        resolveExpression: function(expr) {
          if (expr === '${listing}') return 1;
        }}
      }));

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
      }, fakeEngine({ expressions: { resolveExpression: () => {
        return null;
      }}}));

      expect(parm.activate({listing: 1}).get()).to.equal(1);

      done();
    });
  });
});
