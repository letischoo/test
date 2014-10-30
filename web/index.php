<?php
require_once __DIR__.'/../vendor/autoload.php';

use Symfony\Component\HttpFoundation\Request;

$app = new Silex\Application();

$app->register(new Silex\Provider\SecurityServiceProvider(), array(
    'security.firewalls' => array(
		'game' => array(
			'pattern' => '^/game',
			'form' => array('login_path' => '/login', 'check_path' => '/game/login_check'),
			'logout' => array('logout_path' => '/game/logout'),
			'users' => array(
				'admin' => array('ROLE_ADMIN','5FZ2Z8QIkA7UTZ4BYkoC+GsReLf569mSKDsfods6LYQ8t+a8EW9oaircfMpmaLbPBh4FOBiiFyLfuZmTSUwzZg=='),
				),
			),
		)
	)
);



$app['debug'] = true;
$app->register(new Silex\Provider\UrlGeneratorServiceProvider());
$app->register(new Silex\Provider\SessionServiceProvider());

$app->register(new Silex\Provider\TwigServiceProvider(), array(
    'twig.path' => __DIR__.'/views',
));


$app->get('/game', function() use($app) {
	return $app['twig']->render('game.html');
});

$app->get('/logout', function() use($app) {
	return 'thisisgame';
})
->bind('logout');

$app->get('/', function() use($app) {
	return $app['twig']->render('homepage.html');
});

$app->get('/login', function(Request $request) use ($app) {
    return $app['twig']->render('login.html', array(
        'error'         => $app['security.last_error']($request),
        'last_username' => $app['session']->get('_security.last_username'),
    ));
});

$app->run();
