'use strict';

/**
 * Module dependencies.
 */

var InvalidArgumentError = require('../errors/invalid-argument-error');
var InvalidRequestError = require('../errors/invalid-request-error');
var tokenUtil = require('../utils/token-util');
var is = require('../validator/is');
var _ = require('lodash');
var Promise = require('bluebird');

/**
 * Constructor.
 */

function CodeResponseType(options) {
  options = options || {};

  if (!options.authorizationCodeLifetime) {
    throw new InvalidArgumentError('Missing parameter: `authorizationCodeLifetime`');
  }

  if (!options.model) {
    throw new InvalidArgumentError('Missing parameter: `model`');
  }

  if (!options.model.saveAuthorizationCode) {
    throw new InvalidArgumentError('Invalid argument: model does not implement `saveAuthorizationCode()`');
  }

  this.code = null;
  this.authorizationCodeLifetime = options.authorizationCodeLifetime;
  this.model = options.model;
}

/**
 * Handle code response type.
 */

CodeResponseType.prototype.handle = function(request, client, user, uri, scope) {
  if (!request) {
    throw new InvalidArgumentError('Missing parameter: `request`');
  }

  if (!client) {
    throw new InvalidArgumentError('Missing parameter: `client`');
  }

  if (!user) {
    throw new InvalidArgumentError('Missing parameter: `user`');
  }

  if (!uri) {
    throw new InvalidArgumentError('Missing parameter: `uri`');
  }

  var codeChallenge = this.getCodeChallenge(request);
  var codeChallengeMethod = codeChallenge && this.getCodeChallengeMethod(request);
  var fns = [
    this.generateAuthorizationCode(),
    this.getAuthorizationCodeExpiresAt(client)
  ];

  return Promise.all(fns)
    .bind(this)
    .spread(function(authorizationCode, expiresAt) {
      return this.saveAuthorizationCode(authorizationCode, expiresAt, scope, client, uri, user, codeChallenge, codeChallengeMethod);
    })
    .then(function(code) {
      this.code = code.authorizationCode;
      return code;
    });
};

/**
 * Get authorization code expiration date.
 */

CodeResponseType.prototype.getAuthorizationCodeExpiresAt = function(client) {
  var expires = new Date();
  var authorizationCodeLifetime = this.getAuthorizationCodeLifetime(client);

  expires.setSeconds(expires.getSeconds() + authorizationCodeLifetime);

  return expires;
};

/**
 * Get authorization code lifetime.
 */

CodeResponseType.prototype.getAuthorizationCodeLifetime = function(client) {
  return client.authorizationCodeLifetime || this.authorizationCodeLifetime;
};

/**
 * Save authorization code.
 */

CodeResponseType.prototype.saveAuthorizationCode = function(authorizationCode, expiresAt, scope, client, redirectUri, user, codeChallenge, codeChallengeMethod) {
  var code = {
    authorizationCode: authorizationCode,
    expiresAt: expiresAt,
    redirectUri: redirectUri,
    scope: scope,
    codeChallenge: codeChallenge,
    codeChallengeMethod: codeChallengeMethod
  };

  return Promise.try(this.model.saveAuthorizationCode, [code, client, user]);
};

/**
 * Generate authorization code.
 */

CodeResponseType.prototype.generateAuthorizationCode = function() {
  if (this.model.generateAuthorizationCode) {
    return Promise.try(this.model.generateAuthorizationCode);
  }

  return tokenUtil.generateRandomToken();
};

/**
 * Get Code challenge
 */
CodeResponseType.prototype.getCodeChallenge = function(request) {
  var codeChallenge = request.body.code_challenge || request.query.code_challenge;

  if (!codeChallenge || codeChallenge === '') {
    return;
  }

  if (!is.vschar(codeChallenge)) {
    throw new InvalidRequestError('Invalid parameter: `code_challenge`');
  }

  return codeChallenge;
};

/**
 * Get Code challenge method
 */
CodeResponseType.prototype.getCodeChallengeMethod = function(request) {
  var codeChallengeMethod = request.body.code_challenge_method || request.query.code_challenge_method || 'plain';

  if (!_.includes(['S256', 'plain'], codeChallengeMethod)) {
    throw new InvalidRequestError('Invalid parameter: `code_challenge_method`, use S256 instead');
  }

  return codeChallengeMethod;
};

/**
 * Build redirect uri.
 */

CodeResponseType.prototype.buildRedirectUri = function(redirectUri) {
  if (!redirectUri) {
    throw new InvalidArgumentError('Missing parameter: `redirectUri`');
  }

  redirectUri.search = null;

  return this.setRedirectUriParam(redirectUri, 'code', this.code);
};

/**
 * Set redirect uri parameter.
 */

CodeResponseType.prototype.setRedirectUriParam = function(redirectUri, key, value) {
  if (!redirectUri) {
    throw new InvalidArgumentError('Missing parameter: `redirectUri`');
  }

  if (!key) {
    throw new InvalidArgumentError('Missing parameter: `key`');
  }

  redirectUri.query = redirectUri.query || {};
  redirectUri.query[key] = value;

  return redirectUri;
};

/**
 * Export constructor.
 */

module.exports = CodeResponseType;
