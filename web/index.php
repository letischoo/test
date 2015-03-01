<?php

require_once __DIR__.'/../vendor/autoload.php';

use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Security\Core\User\UserProviderInterface;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Security\Core\User\User;
use Symfony\Component\Security\Core\Exception\UnsupportedUserException;
use Symfony\Component\Security\Core\Exception\UsernameNotFoundException;
use Symfony\Component\HttpFoundation\Session\Storage\Handler\PdoSessionHandler;
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

$app->register(new Silex\Provider\SessionServiceProvider());

$app['session.db_options'] = array(
    'db_table' => 'session',
    'db_id_col' => 'session_id',
    'db_username_col'=> 'session_username',
    'db_data_col' => 'session_value',
    'db_time_col' => 'session_time',
);



$app['games'] = [
    'noughsandcrosses' => ['name' => 'Kółko i krzyżyk', 'capacity' => 2],
];

$app->register(new Silex\Provider\SecurityServiceProvider(), array(
    'security.firewalls' => array(
        'login_path' => array(
            'pattern' => '^/(register|login)$',
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
        array('^/(login|register)$', 'IS_AUTHENTICATED_ANONYMOUSLY'),
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
}

if (!$schema->tablesExist('rooms')) {
    $rooms = new Table('rooms');
    $rooms->addColumn('id', 'integer', array('unsigned' => true, 'autoincrement' => true));
    $rooms->setPrimaryKey(array('id'));
    $rooms->addColumn('gametype', 'string', array('length' => 32));
    $rooms->addColumn('guests', 'integer', array('default' => 0));
    $rooms->addColumn('capacity', 'integer');

    $schema->createTable($rooms);
}

if (!$schema->tablesExist('session')) {
    $session = new Table('session');
    $session->addColumn('session_id', 'string', array('length' => 255));
    $session->setPrimaryKey(array('session_id'));
    $session->addColumn('session_username', 'string', array('length' => 32));
    $session->addColumn('session_value', 'text');
    $session->addColumn('session_time', 'integer');

    $schema->createTable($session);
}


$app->register(new Silex\Provider\UrlGeneratorServiceProvider());
$app->register(new Silex\Provider\SessionServiceProvider());

class PDoSessionUsernameHandler extends PdoSessionHandler {

    private $usernameCol = '';
    private $conn = null;
    private $table = null;
    private $idCol = null;

    function __construct($conn, $db_options, $storage_options) {
        $this->conn = $conn;
        $this->usernameCol = $db_options['db_username_col'];
        $this->table = $db_options['db_table'];
        $this->idCol = $db_options['db_id_col'];
        parent::__construct($conn, $db_options, $storage_options);
    }

    function write($sessionId, $data) {
        $result = parent::write($sessionId, $data);
        $data = unserialize($_SESSION['_sf2_attributes']['_security_game']);
        $username = $data->getUser()->getUsername();
        $updateStmt = $this->conn->prepare(
            "UPDATE $this->table SET $this->usernameCol = :username WHERE $this->idCol = :id"
        );
        $updateStmt->bindParam(':id', $sessionId, \PDO::PARAM_STR);
        $updateStmt->bindParam(':username', $username, \PDO::PARAM_STR);
        $updateStmt->execute();
        return $result;
    }
}

$app['session.storage.handler'] = $app->share(function () use ($app) {
    return new PdoSessionUsernameHandler(
        $app['db']->getWrappedConnection(),
        $app['session.db_options'],
        $app['session.storage.options']
    );
});

$app->register(new Silex\Provider\TwigServiceProvider(), array(
    'twig.path' => __DIR__.'/../views',
));

$app->get('/listrooms/{gametype}', function($gametype) use ($app) {
    if (!array_key_exists($gametype, $app['games'])) {
        $app->abort(404, 'Gametype does not exist!');
    }

    $games_sql = $app['db']->prepare('SELECT * FROM rooms where guests < capacity and gametype = :gametype');
    $games_sql->bindParam(':gametype', $gametype, \PDO::PARAM_STR);
    $games_sql->execute();
    $games = $games_sql->fetchAll(\PDO::FETCH_ASSOC);

    $data = [
        'gametype' => $gametype,
        'gamename' => $app['games'][$gametype]['name'],
        'games' => $games,
    ];
    return $app['twig']->render('listrooms.html', $data);
})
->bind('listrooms');

$app->post('/createroom/{gametype}', function($gametype) use ($app) {
    if (!array_key_exists($gametype, $app['games'])) {
        $app->abort(404, 'Gametype does not exist!');
    }

    $app['db']->insert('rooms', array(
        'gametype' => $gametype,
        'capacity' => $app['games'][$gametype]['capacity'],
    ));

    return $app->redirect($app['url_generator']->generate(
        'game', array('room_id' => $app['db']->lastInsertId())
    ));
})
->bind('createroom');

$app->get('/game/{room_id}', function ($room_id) use ($app) {
    $result = $app['db']->fetchAssoc(
        "SELECT * FROM rooms where id = :id",
        array('id' => (int) $room_id)
    );

    if (!$result) {
        $app->abort(404, 'No such room!');
    }

    $data = array(
        'game' => $result,
    );

    return $app['twig']->render('game.html', $data);
})
->bind('game');


$app->get('/logout', function() use($app) {
    return 'thisisgame';
})
->bind('logout');

$app->get('/', function() use($app) {
    return $app['twig']->render('homepage.html', ['games' => $app['games']]);
})
->bind('homepage');

$app->get('/register', function() use($app) {
    return $app['twig']->render('register.html', ['error' => null]);
})
->bind('register');

$app->post('/register', function(Request $request) use($app) {
    $req = $request->request;
    $username = (string) $req->get('username');
    $password = (string) $req->get('password');
    $password_repeat = (string) $req->get('password_repeat');

    if (!$username) {
        return $app['twig']->render('register.html',
            ['error' => 'Podaj login.']);
    }

    $result = $app['db']->fetchAssoc(
        "SELECT * FROM users where username = :username",
        array('username' => $username)
    );

    if ($result) {
        return $app['twig']->render('register.html',
            ['error' => 'Użytkownik o takim loginie już istnieje.']);
    }

    if (!$password) {
        return $app['twig']->render('register.html',
            ['error' => 'Podaj hasło.']);
    }

    if ($password !== $password_repeat) {
        return $app['twig']->render('register.html',
            ['error' => 'Hasła nie zgadzają się.']);
    }

    $hashed_password = $app['security.encoder.digest']->encodePassword($password);

    $app['db']->insert('users', array(
        'username' => $username,
        'password' => $hashed_password,
        'roles' => 'ROLE_USER',
    ));

    return $app->redirect('/login');
});

$app->get('/login', function(Request $request) use ($app) {
    return $app['twig']->render('login.html', array(
        'error' => $app['security.last_error']($request),
        'last_username' => $app['session']->get('_security.last_username'),
    ));
});

$app->run();
