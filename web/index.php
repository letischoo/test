<?php
require_once __DIR__.'/../vendor/autoload.php';

$app = new Silex\Application();

$app->register(new Silex\Provider\SecurityServiceProvider(), array(
    'security.firewalls' => array(
	'game' => array(
		'pattern' => '^/game',
		'form' => array('login_path' => '/login', 'check_path' => '/game/login_check'),
		'users' => array(
			'admin' => array('ROLE_ADMIN','5FZ2Z8QIkA7UTZ4BYkoC+GsReLf569mSKDsfods6LYQ8t+a8EW9oaircfMpmaLbPBh4FOBiiFyLfuZmTSUwzZg=='),
			),
		),
	)
));




$app->get('/hello/{name}', function($name) use($app) {
	return 'Hello '.$app->escape($name);
});

$app->get('/game', function() use($app) {
	return 'thisisgame';
});

$app->get('/login', function() use($app) {
	return 'login form';
});


$app->run();
