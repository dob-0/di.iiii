export const getProductionPromotionPlan = ({
    mainCommit,
    stagingCommit,
    mainInStaging,
    stagingInMain
}) => {
    if (!mainCommit || !stagingCommit) {
        throw new Error('Production promotion planning requires both main and staging commits.')
    }

    if (mainCommit === stagingCommit) {
        return {
            type: 'noop'
        }
    }

    if (mainInStaging) {
        return {
            type: 'fast-forward'
        }
    }

    if (stagingInMain) {
        return {
            type: 'abort-main-ahead'
        }
    }

    return {
        type: 'merge'
    }
}
