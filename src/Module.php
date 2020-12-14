<?php
/**
 * See LICENSE.md file for further details.
 */
namespace MagicSunday\Webtrees\AncestralFanChart;

use Fisharebest\Webtrees\Auth;
use Fisharebest\Webtrees\Filter;
use Fisharebest\Webtrees\Individual;
use Fisharebest\Webtrees\Menu;
use Fisharebest\Webtrees\Module as WebtreesModule;
use Fisharebest\Webtrees\Module\AbstractModule;
use Fisharebest\Webtrees\Module\ModuleChartInterface;
use Fisharebest\Webtrees\Tree;
use MagicSunday\Webtrees\AncestralFanChart\Controller\Chart;

/**
 * Ancestral fan chart module class.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-fan-chart/
 */
class Module extends AbstractModule implements ModuleChartInterface
{
    /**
     * Returns whether the chart module is active or not.
     *
     * @return boolean
     */
    private function isActive()
    {
        return WebtreesModule::isActiveChart($this->getTree(), 'webtrees-fan-chart');
    }

    /**
     * Get tree instance.
     *
     * @return Tree
     */
    private function getTree()
    {
        global $WT_TREE;
        return $WT_TREE;
    }

    /**
     * Translate a string, and then substitute placeholders.
     *
     * @return string
     */
    private function translate(/* var_args */)
    {
        // Damn ugly static methods all around :(
        return call_user_func_array(
            '\\Fisharebest\\Webtrees\\I18N::translate',
            func_get_args()
        );
    }

    /**
     * Get the modules static url path.
     *
     * @return string
     */
    private function getModuleUrlPath()
    {
        return WT_STATIC_URL . WT_MODULES_DIR . $this->getName();
    }

    /**
     * How should this module be labelled on tabs, menus, etc.?
     *
     * @return string
     */
    public function getTitle()
    {
        return $this->translate('Ancestral fan chart');
    }

    /**
     * A sentence describing what this module does.
     *
     * @return string
     */
    public function getDescription()
    {
        return $this->translate('A fan chart of an individual’s ancestors.');
    }

    /**
     * Return a menu item for this chart.
     *
     * @param Individual $individual Current individual instance
     *
     * @return Menu
     */
    public function getChartMenu(Individual $individual)
    {
        $link = 'module.php?mod=' . $this->getName()
            . '&amp;rootid=' . $individual->getXref()
            . '&amp;ged=' . $individual->getTree()->getNameUrl();

        return new Menu(
            $this->getTitle(),
            $link,
            'menu-chart-fanchart',
            array(
                'rel' => 'nofollow',
            )
        );
    }

    /**
     * Return a menu item for this chart - for use in individual boxes.
     *
     * @param Individual $individual Current individual instance
     *
     * @return Menu
     */
    public function getBoxChartMenu(Individual $individual)
    {
        return $this->getChartMenu($individual);
    }

    /**
     * This is a general purpose hook, allowing modules to respond to routes
     * of the form module.php?mod=FOO&mod_action=BAR
     *
     * @param string $modAction Module action
     *
     * @return void
     */
    public function modAction($modAction)
    {
        if ($modAction === 'update') {
            $rootId = Filter::get('rootid', WT_REGEX_XREF);
            $person = Individual::getInstance($rootId, $this->getTree());
            $chart  = new Chart();

            header('Content-Type: application/json;charset=UTF-8');

            echo json_encode($chart->buildJsonTree($person));
            exit;
        }

        global $controller;

        $urlPath = $this->getModuleUrlPath();

        $controller = new Chart();
        $controller
            ->restrictAccess($this->isActive())
            ->pageHeader()
            ->addExternalJavascript(WT_AUTOCOMPLETE_JS_URL)
            ->addExternalJavascript($urlPath . '/js/packages/d3.v4.custom.min.js')
            ->addExternalJavascript($urlPath . '/js/webtrees-fan-chart.js');

        echo '<link rel="stylesheet" type="text/css" href="'
            . $urlPath . '/css/webtrees-fan-chart.css">';

        echo $controller->render();
    }
}
