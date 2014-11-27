<?php
require_once __DIR__.'/../vendor/autoload.php';

use Symfony\Component\HttpFoundation\Request;

$app = new Silex\Application();

$app->register(new Silex\Provider\SecurityServiceProvider(), array(
    'security.firewalls' => array(
		'login_path' => array(
        	'pattern' => '^/login$',
        	'anonymous' => true
    	),
		'game' => array(
			'pattern' => '^/',
			'form' => array('login_path' => '/login', 'check_path' => '/login_check'),
			'logout' => array('logout_path' => '/logout'),
			'users' => array(
				'admin' => array('ROLE_ADMIN','5FZ2Z8QIkA7UTZ4BYkoC+GsReLf569mSKDsfods6LYQ8t+a8EW9oaircfMpmaLbPBh4FOBiiFyLfuZmTSUwzZg=='),
			),
		),
	),
	'security.access_rules' => array(
       	array('^/login$', 'IS_AUTHENTICATED_ANONYMOUSLY'),
       	array('^/.+$', 'ROLE_USER'),
    ),
    'security.role_hierarchy' => array(
        'ROLE_ADMIN' => array('ROLE_USER'),
    )
));

$app['debug'] = true;
$app->register(new Silex\Provider\UrlGeneratorServiceProvider());
$app->register(new Silex\Provider\SessionServiceProvider());

$app->register(new Silex\Provider\TwigServiceProvider(), array(
    'twig.path' => __DIR__.'/../views',
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
