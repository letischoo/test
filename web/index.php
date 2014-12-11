<?php
require_once __DIR__.'/../vendor/autoload.php';

use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Security\Core\User\UserProviderInterface;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Security\Core\User\User;
use Symfony\Component\Security\Core\Exception\UnsupportedUserException;
use Symfony\Component\Security\Core\Exception\UsernameNotFoundException;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Schema\Table;


class UserProvider implements UserProviderInterface
{
    private $conn;

    public function __construct(Connection $conn)
    {
        $this->conn = $conn;
    }

    public function loadUserByUsername($username)
    {
        $stmt = $this->conn->executeQuery('SELECT * FROM users WHERE username = ?', array(strtolower($username)));

        if (!$user = $stmt->fetch()) {
            throw new UsernameNotFoundException(sprintf('Username "%s" does not exist.', $username));
        }

        return new User($user['username'], $user['password'], explode(',', $user['roles']), true, true, true, true);
    }

    public function refreshUser(UserInterface $user)
    {
        if (!$user instanceof User) {
            throw new UnsupportedUserException(sprintf('Instances of "%s" are not supported.', get_class($user)));
        }

        return $this->loadUserByUsername($user->getUsername());
    }

    public function supportsClass($class)
    {
        return $class === 'Symfony\Component\Security\Core\User\User';
    }
}




$app = new Silex\Application();


$app->register(new Silex\Provider\DoctrineServiceProvider(), array(
    'dbs.options' => array (
        'mysql_read' => array(
            'driver'    => 'pdo_mysql',
            'host'      => 'localhost',
            'dbname'    => 'projekt',
            'user'      => 'dominik',
            'password'  => '123qwe',
            'charset'   => 'utf8',
        ),
    )
));


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
			'users' => $app->share(function () use ($app) {
                return new UserProvider($app['db']);
            }),
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


$schema = $app['db']->getSchemaManager();
if (!$schema->tablesExist('users')) {
    $users = new Table('users');
    $users->addColumn('id', 'integer', array('unsigned' => true, 'autoincrement' => true));
    $users->setPrimaryKey(array('id'));
    $users->addColumn('username', 'string', array('length' => 32));
    $users->addUniqueIndex(array('username'));
    $users->addColumn('password', 'string', array('length' => 255));
    $users->addColumn('roles', 'string', array('length' => 255));

    $schema->createTable($users);

    $app['db']->insert('users', array(
      'username' => 'admin',
      'password' => '5FZ2Z8QIkA7UTZ4BYkoC+GsReLf569mSKDsfods6LYQ8t+a8EW9oaircfMpmaLbPBh4FOBiiFyLfuZmTSUwzZg==',
      'roles' => 'ROLE_ADMIN'
    ));
}


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
