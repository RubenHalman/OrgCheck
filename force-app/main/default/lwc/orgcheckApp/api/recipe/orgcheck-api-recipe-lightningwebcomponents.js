import { OrgCheckRecipe } from '../core/orgcheck-api-recipe';
import { DATASET_LIGHTNINGWEBCOMPONENTS_ALIAS } from '../core/orgcheck-api-datasetmanager';

export class OrgCheckRecipeLightningWebComponents extends OrgCheckRecipe {

    /** 
     * Return the list of dataset you need 
     * 
     * @returns {Array<string>}
     */
    extract() {
        return [DATASET_LIGHTNINGWEBCOMPONENTS_ALIAS];
    }

    /**
     * Get a list of Web Components (async method)
     * 
     * @param {Map} data extracted
     * @param {string} namespace you want to list (optional), '*' for any
     * 
     * @returns {Array<SFDC_LightningWebComponent>}
     */
    transform(data, namespace) {
        // Get data
        const components = data.get(DATASET_LIGHTNINGWEBCOMPONENTS_ALIAS);
        // Filter data
        const array = [];
        components.forEach((component) => {
            if (namespace === '*' || component.package === namespace) {
                array.push(component);
            }
        });
        // Return data
        return array;
    }
}