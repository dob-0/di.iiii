// Plans how to promote the integration source branch (dev) onto main for a production deploy.
export const getProductionPromotionPlan = ({
    mainCommit,
    sourceCommit,
    mainInSource,
    sourceInMain
}) => {
    if (!mainCommit || !sourceCommit) {
        throw new Error('Production promotion planning requires both main and source commits.')
    }

    if (mainCommit === sourceCommit) {
        return {
            type: 'noop'
        }
    }

    if (mainInSource) {
        return {
            type: 'fast-forward'
        }
    }

    if (sourceInMain) {
        return {
            type: 'abort-main-ahead'
        }
    }

    return {
        type: 'merge'
    }
}
